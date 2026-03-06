import { NextResponse } from "next/server";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { getDataDir } from "@/lib/data-dir";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  listContracts,
  listFleetVehicles,
  listInvoices,
  listReservations,
} from "@/lib/services/rental-service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, status: "unauthorized", error: "Sesión requerida" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const dataDir = getDataDir();
  const writeProbePath = path.join(dataDir, `.health-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);

  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(writeProbePath, "ok", "utf8");
    await rm(writeProbePath, { force: true });

    const [reservations, contracts, invoices, fleet] = await Promise.all([
      listReservations(""),
      listContracts(""),
      listInvoices(""),
      listFleetVehicles(),
    ]);

    return NextResponse.json({
      ok: true,
      status: "ok",
      runtimeMs: Date.now() - startedAt,
      dataDir,
      flags: getFeatureFlags(),
      counts: {
        reservations: reservations.length,
        contracts: contracts.length,
        invoices: invoices.length,
        fleet: fleet.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Healthcheck failed";
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        runtimeMs: Date.now() - startedAt,
        dataDir,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

