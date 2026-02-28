import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildSimplePdf } from "@/lib/pdf";
import { listDeliveries } from "@/lib/services/rental-service";

export async function GET(request: Request) {
  // Endpoint protegido: requiere sesión.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Filtros de exportación (rango + sucursal opcional).
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const branch = url.searchParams.get("branch") ?? "";

  const data = await listDeliveries({ from: `${from}T00:00:00`, to: `${to}T23:59:59`, branch });

  // Exporta dos bloques: con contrato y pendientes/sin matrícula.
  const pdf = await buildSimplePdf({
    title: "Listado Entregas",
    subtitle: `Rango ${from} a ${to} | Sucursal filtro: ${branch || "Todas"}`,
    sections: [
      {
        title: "Con contrato generado",
        rows: data.withContract.map((row) => [
          row.reservationNumber,
          `${row.datetime} | ${row.customerName} | ${row.vehiclePlate || "N/D"} | ${row.place || "N/D"}`,
        ]),
      },
      {
        title: "Sin contrato / sin matrícula",
        rows: data.withoutContract.map((row) => [
          row.reservationNumber,
          `${row.datetime} | ${row.customerName} | ${row.vehiclePlate || "N/D"} | ${row.place || "N/D"}`,
        ]),
      },
    ],
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"entregas-${from}-${to}.pdf\"`,
    },
  });
}
