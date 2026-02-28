import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getVehicleProductionSummary } from "@/lib/services/rental-service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const rows = await getVehicleProductionSummary({ from: `${from}T00:00:00`, to: `${to}T23:59:59` });

  const header = "matricula,ingresos,gastos,coste_base,rentabilidad";
  const csv = [
    header,
    ...rows.map((row) =>
      [row.plate, row.income.toFixed(2), row.expenses.toFixed(2), row.costBase.toFixed(2), row.profitability.toFixed(2)].join(
        ",",
      ),
    ),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"productividad-${from}-${to}.csv\"`,
    },
  });
}
