import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCompanyPrimaryColor } from "@/lib/company-brand";
import { buildOperationalListPdf } from "@/lib/operational-list-pdf";
import { getCompanySettings, listPickups } from "@/lib/services/rental-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const branch = url.searchParams.get("branch") ?? "";
  const status = (url.searchParams.get("status") ?? "TODOS").toUpperCase();

  const data = await listPickups({ from: `${from}T00:00:00`, to: `${to}T23:59:59`, branch });
  const settings = await getCompanySettings();
  const rows = [...data.withContract, ...data.withoutContract].toSorted((a, b) => a.datetime.localeCompare(b.datetime));
  const dedupedRows = rows
    .filter((row, index, all) => all.findIndex((item) => item.reservationId === row.reservationId) === index)
    .filter((row) => status === "TODOS" || row.stateLabel === status);

  const pdf = await buildOperationalListPdf({
    title: "Recogidas",
    from,
    to,
    rows: dedupedRows,
    accentColor: getCompanyPrimaryColor(settings),
  });

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"recogidas-${from}-${to}.pdf\"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
