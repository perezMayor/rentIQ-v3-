// Endpoint HTTP de reporting/vehiculos/export.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listContracts, listFleetVehicles, listReservations } from "@/lib/services/rental-service";

type ExportType = "situacion" | "general" | "bajas" | "general_bajas" | "limite";

function asDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function esc(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

    const csv = [
      "matricula,modelo,donde_esta,ultimo_alquiler_recogida",
      ...rows.map((row) => [esc(row.plate), esc(row.modelLabel), esc(row.location), esc(row.lastPickupAt)].join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"vehiculos-situacion-${from}-${to}.csv\"`,
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

    const csv = [
      "matricula,modelo,grupo,limite_alquiler,estado",
      ...rows.map((row) => [esc(row.plate), esc(row.modelLabel), esc(row.categoryLabel), esc(row.activeUntil || "N/D"), esc(row.deactivatedAt ? "BAJA" : "ALTA")].join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"vehiculos-limite-${limitDate}.csv\"`,
      },
    });
  }

  const source = type === "bajas" ? fleetDropped : type === "general" ? fleetActive : fleet;
  const csv = [
    "matricula,modelo,grupo,propietario,alta,limite_alquiler,baja,motivo_baja",
    ...source.map((row) => [esc(row.plate), esc(row.modelLabel), esc(row.categoryLabel), esc(row.owner || "N/D"), esc(row.activeFrom || "N/D"), esc(row.activeUntil || "N/D"), esc(row.deactivatedAt || "N/D"), esc(row.deactivationReason || "N/D")].join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"vehiculos-${type}-${from}-${to}.csv\"`,
    },
  });
}
