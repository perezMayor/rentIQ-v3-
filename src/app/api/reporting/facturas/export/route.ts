import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listInvoiceJournal } from "@/lib/services/rental-service";

function safeDate(input: string | null, fallback: string) {
  const value = (input ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
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

  const invoices = await listInvoiceJournal({ q, from, to });
  const rows = [
    ["numero", "nombre", "contrato_id", "fecha", "base", "extras", "seguros", "penalizaciones", "iva_pct", "iva", "total"].join(","),
    ...invoices.map((invoice) =>
      [
        invoice.invoiceNumber,
        invoice.invoiceName,
        invoice.contractId,
        invoice.issuedAt,
        invoice.baseAmount.toFixed(2),
        invoice.extrasAmount.toFixed(2),
        invoice.insuranceAmount.toFixed(2),
        invoice.penaltiesAmount.toFixed(2),
        invoice.ivaPercent.toFixed(2),
        invoice.ivaAmount.toFixed(2),
        invoice.totalAmount.toFixed(2),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];

  const filename = `facturas-${from}-a-${to}.csv`;
  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
