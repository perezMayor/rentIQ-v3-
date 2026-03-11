import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { formatDateTimeDisplay, formatMoneyDisplay } from "@/lib/formatting";
import { buildSimplePdf } from "@/lib/pdf";
import { getCompanySettings, listInvoiceJournal } from "@/lib/services/rental-service";

function safeDate(input: string | null, fallback: string) {
  const value = (input ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role === "LECTOR") {
    return NextResponse.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const from = safeDate(url.searchParams.get("from"), fromDefault);
  const to = safeDate(url.searchParams.get("to"), today);

  const [invoices, settings] = await Promise.all([listInvoiceJournal({ q, from, to }), getCompanySettings()]);
  const pdf = await buildSimplePdf({
    title: "Listado de facturas",
    subtitle: `Rango ${from} a ${to}`,
    companyName: getDocumentCompanyName(settings),
    companyTaxId: settings.taxId,
    companyAddress: settings.fiscalAddress,
    companyFooter: settings.documentFooter,
    logoDataUrl: getCompanyLogoDataUrl(settings),
    accentColor: getCompanyPrimaryColor(settings),
    sections: invoices.map((invoice) => ({
      title: `${invoice.invoiceNumber} · ${invoice.invoiceName}`,
      rows: [
        ["Contrato", invoice.contractId ?? "MANUAL"],
        ["Fecha", formatDateTimeDisplay(invoice.issuedAt)],
        ["Base", formatMoneyDisplay(invoice.baseAmount)],
        ["IVA", `${invoice.ivaPercent.toFixed(2)}% · ${formatMoneyDisplay(invoice.ivaAmount)}`],
        ["Total", formatMoneyDisplay(invoice.totalAmount)],
        ["Estado", invoice.status === "FINAL" ? "Final" : "Borrador"],
      ],
    })),
  });

  const filename = `facturas-${from}-a-${to}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
