// Endpoint HTTP de reporting/vehiculos/export.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildSimplePdf } from "@/lib/pdf";
import { listContracts, listFleetVehicles, listReservations, getCompanySettings } from "@/lib/services/rental-service";

type ExportType = "situacion" | "general" | "bajas" | "general_bajas" | "limite";

function asDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function typeTitle(type: ExportType) {
  if (type === "situacion") return "Situación: coches no alquilados";
  if (type === "bajas") return "Listado de bajas";
  if (type === "general_bajas") return "Flota actual + bajas";
  if (type === "limite") return "Fecha límite de alquiler";
  return "Flota actual";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const typeRaw = (url.searchParams.get("type") ?? "general").trim().toLowerCase();
  const type: ExportType =
    typeRaw === "situacion" || typeRaw === "general" || typeRaw === "bajas" || typeRaw === "general_bajas" || typeRaw === "limite"
      ? (typeRaw as ExportType)
      : "general";

  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? today;
  const to = url.searchParams.get("to") ?? today;
  const limitDate = url.searchParams.get("limitDate") ?? to;

  const fleet = await listFleetVehicles();
  const reservations = await listReservations("");
  const contracts = await listContracts("");
  const settings = await getCompanySettings();

  const listFromIso = `${from}T00:00:00`;
  const listToIso = `${to}T23:59:59`;
  const limitDateIso = `${limitDate}T23:59:59`;

  const fleetActive = fleet.filter((item) => !item.deactivatedAt);
  const fleetDropped = fleet.filter((item) => Boolean(item.deactivatedAt));

  if (type === "situacion") {
    const rows = fleetActive
      .map((vehicle) => {
        const history = reservations
          .filter((reservation) => reservation.assignedPlate.toUpperCase() === vehicle.plate.toUpperCase())
          .toSorted((a, b) => b.pickupAt.localeCompare(a.pickupAt));
        const overlaps = history.some((reservation) => {
          const d1 = asDate(reservation.deliveryAt);
          const d2 = asDate(reservation.pickupAt);
          const fromDate = asDate(listFromIso);
          const toDate = asDate(listToIso);
          if (!d1 || !d2 || !fromDate || !toDate) return false;
          return d1 < toDate && fromDate < d2;
        });
        const openContract = contracts.find(
          (contract) => contract.status === "ABIERTO" && contract.vehiclePlate.toUpperCase() === vehicle.plate.toUpperCase(),
        );
        const lastReservation = history[0] ?? null;
        return {
          plate: vehicle.plate,
          modelLabel: vehicle.modelLabel,
          status: overlaps ? "ALQUILADO_EN_RANGO" : "NO_ALQUILADO",
          location: openContract
            ? `Alquilado (${openContract.contractNumber})`
            : lastReservation?.pickupPlace || lastReservation?.pickupBranch || "Base",
          lastPickupAt: lastReservation?.pickupAt || "N/D",
        };
      })
      .filter((item) => item.status === "NO_ALQUILADO");

    const pdf = await buildSimplePdf({
      title: `Vehículos · ${typeTitle(type)}`,
      subtitle: `Rango ${from} a ${to}`,
      companyName: settings.documentBrandName || settings.companyName,
      companyTaxId: settings.taxId,
      companyAddress: settings.fiscalAddress,
      companyFooter: settings.documentFooter,
      logoDataUrl: settings.logoDataUrl,
      accentColor: settings.brandPrimaryColor,
      sections: rows.map((row) => ({
        title: `${row.plate} · ${row.modelLabel}`,
        rows: [
          ["Dónde está", row.location],
          ["Última recogida", row.lastPickupAt],
        ],
      })),
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"vehiculos-situacion-${from}-${to}.pdf\"`,
      },
    });
  }

  if (type === "limite") {
    const rows = fleetActive.filter((vehicle) => {
      if (!vehicle.activeUntil) return false;
      const vDate = asDate(`${vehicle.activeUntil}T23:59:59`);
      const lDate = asDate(limitDateIso);
      if (!vDate || !lDate) return false;
      return vDate <= lDate;
    });

    const pdf = await buildSimplePdf({
      title: `Vehículos · ${typeTitle(type)}`,
      subtitle: `Hasta ${limitDate}`,
      companyName: settings.documentBrandName || settings.companyName,
      companyTaxId: settings.taxId,
      companyAddress: settings.fiscalAddress,
      companyFooter: settings.documentFooter,
      logoDataUrl: settings.logoDataUrl,
      accentColor: settings.brandPrimaryColor,
      sections: rows.map((row) => ({
        title: `${row.plate} · ${row.modelLabel}`,
        rows: [
          ["Grupo", row.categoryLabel],
          ["Límite alquiler", row.activeUntil || "N/D"],
          ["Estado", row.deactivatedAt ? "BAJA" : "ALTA"],
        ],
      })),
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"vehiculos-limite-${limitDate}.pdf\"`,
      },
    });
  }

  const source = type === "bajas" ? fleetDropped : type === "general" ? fleetActive : fleet;
  const pdf = await buildSimplePdf({
    title: `Vehículos · ${typeTitle(type)}`,
    subtitle: `Rango ${from} a ${to}`,
    companyName: settings.documentBrandName || settings.companyName,
    companyTaxId: settings.taxId,
    companyAddress: settings.fiscalAddress,
    companyFooter: settings.documentFooter,
    logoDataUrl: settings.logoDataUrl,
    accentColor: settings.brandPrimaryColor,
    sections: source.map((row) => ({
      title: `${row.plate} · ${row.modelLabel}`,
      rows: [
        ["Grupo", row.categoryLabel],
        ["Propietario", row.owner || "N/D"],
        ["Alta", row.activeFrom || "N/D"],
        ["Límite alquiler", row.activeUntil || "N/D"],
        ["Baja", row.deactivatedAt || "N/D"],
        ["Motivo", row.deactivationReason || "N/D"],
      ],
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"vehiculos-${type}-${from}-${to}.pdf\"`,
    },
  });
}
