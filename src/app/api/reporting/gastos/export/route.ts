import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { formatDateDisplay, formatMoneyDisplay } from "@/lib/formatting";
import { buildSimplePdf } from "@/lib/pdf";
import { getCompanySettings, listDailyOperationalExpenses } from "@/lib/services/rental-service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const plate = url.searchParams.get("plate") ?? "";
  const worker = url.searchParams.get("worker") ?? "";

  const [report, settings] = await Promise.all([listDailyOperationalExpenses({ from, to, plate, worker }), getCompanySettings()]);
  const pdf = await buildSimplePdf({
    title: "Diario contable",
    subtitle: `Rango ${from} a ${to}`,
    companyName: getDocumentCompanyName(settings),
    companyTaxId: settings.taxId,
    companyAddress: settings.fiscalAddress,
    companyFooter: settings.documentFooter,
    logoDataUrl: getCompanyLogoDataUrl(settings),
    accentColor: getCompanyPrimaryColor(settings),
    sections: report.rows.map((row) => ({
      title: `${formatDateDisplay(row.expenseDate)} · ${row.vehiclePlate}`,
      rows: [
        ["Categoría", row.category],
        ["Importe", formatMoneyDisplay(row.amount)],
        ["Empleado", row.workerName || "N/D"],
        ["Batch", row.batchId || "N/D"],
        ["Nota", row.note || "N/D"],
      ],
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"gastos-${from}-${to}.pdf\"`,
    },
  });
}
