import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { formatDateTimeDisplay, formatMoneyDisplay } from "@/lib/formatting";
import { buildSimplePdf } from "@/lib/pdf";
import { getCompanySettings, listContracts } from "@/lib/services/rental-service";

function safeDate(input: string | null, fallback: string) {
  const value = (input ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function parseDateSafe(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function inRange(value: string, from: string, to: string) {
  const target = parseDateSafe(value);
  const start = parseDateSafe(from);
  const end = parseDateSafe(to);
  if (!target || !start || !end) return false;
  return target >= start && target <= end;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const from = safeDate(url.searchParams.get("from"), fromDefault);
  const to = safeDate(url.searchParams.get("to"), today);
  const branch = (url.searchParams.get("branch") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "TODOS").trim().toUpperCase();
  const dateField = (url.searchParams.get("dateField") ?? "CREACION").trim().toUpperCase();
  const order = (url.searchParams.get("order") ?? "DESC").trim().toUpperCase();

  const [contracts, settings] = await Promise.all([listContracts(""), getCompanySettings()]);
  const filtered = contracts
    .filter((contract) => {
      const dateValue =
        dateField === "ENTREGA"
          ? contract.deliveryAt
          : dateField === "RECOGIDA"
            ? contract.pickupAt
            : contract.createdAt;
      return inRange(dateValue, `${from}T00:00:00`, `${to}T23:59:59`);
    })
    .filter((contract) => (status === "TODOS" ? true : contract.status === status))
    .filter((contract) => (!branch ? true : contract.branchCode.toLowerCase().includes(branch.toLowerCase())))
    .filter((contract) =>
      !q
        ? true
        : [contract.contractNumber, contract.customerName, contract.companyName, contract.vehiclePlate, contract.branchCode]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase()),
    )
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (order === "ASC") filtered.reverse();

  const pdf = await buildSimplePdf({
    title: "Listado de contratos",
    subtitle: `Rango ${from} a ${to} | Sucursal filtro: ${branch || "Todas"}`,
    companyName: getDocumentCompanyName(settings),
    companyTaxId: settings.taxId,
    companyAddress: settings.fiscalAddress,
    companyFooter: settings.documentFooter,
    logoDataUrl: getCompanyLogoDataUrl(settings),
    accentColor: getCompanyPrimaryColor(settings),
    sections: filtered.map((row) => ({
      title: `${row.contractNumber} · ${row.customerName}`,
      rows: [
        ["Sucursal", row.branchCode || "N/D"],
        ["Empresa", row.companyName || "N/D"],
        ["Matrícula", row.vehiclePlate || "N/D"],
        ["Entrega", formatDateTimeDisplay(row.deliveryAt)],
        ["Recogida", formatDateTimeDisplay(row.pickupAt)],
        ["Estado", row.status],
        ["Total", formatMoneyDisplay(row.totalSettlement)],
      ],
    })),
  });

  const filename = `contratos-${from}-a-${to}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
