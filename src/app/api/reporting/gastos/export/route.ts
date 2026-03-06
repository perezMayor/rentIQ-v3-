// Endpoint HTTP de reporting/gastos/export.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listDailyOperationalExpenses } from "@/lib/services/rental-service";

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

  const report = await listDailyOperationalExpenses({ from, to, plate, worker });
  const header = "fecha,matricula,categoria,importe,empleado,batch,nota";
  const rows = report.rows.map((row) => {
    const note = (row.note ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""');
    return [
      row.expenseDate,
      row.vehiclePlate,
      row.category,
      row.amount.toFixed(2),
      row.workerName,
      row.batchId,
      `"${note}"`,
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"gastos-${from}-${to}.csv\"`,
    },
  });
}
