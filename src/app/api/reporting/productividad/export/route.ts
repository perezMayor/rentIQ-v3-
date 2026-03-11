import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { formatMoneyDisplay } from "@/lib/formatting";
import { buildSimplePdf } from "@/lib/pdf";
import { getCompanySettings, getVehicleProductionSummary } from "@/lib/services/rental-service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const [rows, settings] = await Promise.all([
    getVehicleProductionSummary({ from: `${from}T00:00:00`, to: `${to}T23:59:59` }),
    getCompanySettings(),
  ]);

  const pdf = await buildSimplePdf({
    title: "Productividad por vehículo",
    subtitle: `Rango ${from} a ${to}`,
    companyName: getDocumentCompanyName(settings),
    companyTaxId: settings.taxId,
    companyAddress: settings.fiscalAddress,
    companyFooter: settings.documentFooter,
    logoDataUrl: getCompanyLogoDataUrl(settings),
    accentColor: getCompanyPrimaryColor(settings),
    sections: rows.map((row) => ({
      title: row.plate,
      rows: [
        ["Ingresos", formatMoneyDisplay(row.income)],
        ["Gastos", formatMoneyDisplay(row.expenses)],
        ["Coste base", formatMoneyDisplay(row.costBase)],
        ["Rentabilidad", formatMoneyDisplay(row.profitability)],
      ],
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"productividad-${from}-${to}.pdf\"`,
    },
  });
}
