// Endpoint HTTP de reporting/facturas/conciliacion/export.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listContractClosureReconciliation } from "@/lib/services/rental-service";

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
  const from = safeDate(url.searchParams.get("from"), fromDefault);
  const to = safeDate(url.searchParams.get("to"), today);

  const rows = await listContractClosureReconciliation({ from, to });
  const csv = [
    ["contrato_numero", "fecha_cierre", "caja_importe", "caja_metodo", "factura_numero", "factura_total"].join(","),
    ...rows.map((row) =>
      [
        row.contractNumber,
        row.closedAt,
        row.cashAmount.toFixed(2),
        row.cashMethod,
        row.invoiceNumber,
        row.invoiceTotal.toFixed(2),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];

  const filename = `conciliacion-${from}-a-${to}.csv`;
  return new NextResponse(csv.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
