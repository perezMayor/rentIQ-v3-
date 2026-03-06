// Endpoint HTTP de reporting/contratos/export.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listContracts } from "@/lib/services/rental-service";

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

function esc(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

  const contracts = await listContracts("");
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

  if (order === "ASC") {
    filtered.reverse();
  }

  const csv = [
    "contrato,cliente,empresa,sucursal,matricula,entrega,recogida,estado,total",
    ...filtered.map((row) =>
      [
        esc(row.contractNumber),
        esc(row.customerName),
        esc(row.companyName || "N/D"),
        esc(row.branchCode),
        esc(row.vehiclePlate || "N/D"),
        esc(row.deliveryAt),
        esc(row.pickupAt),
        esc(row.status),
        esc(row.totalSettlement.toFixed(2)),
      ].join(","),
    ),
  ].join("\n");

  const filename = `contratos-${from}-a-${to}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}

