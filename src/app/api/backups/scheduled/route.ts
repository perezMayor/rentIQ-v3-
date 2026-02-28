import { NextResponse } from "next/server";
import { createFullBackup } from "@/lib/services/backup-service";

// Convierte hora actual a zona Madrid para decidir ventana de ejecución.
function getMadridHourMinute(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export async function POST(request: Request) {
  // Seguridad: token obligatorio para impedir ejecuciones no autorizadas.
  const token = process.env.BACKUP_SCHEDULE_TOKEN;
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = token ? `Bearer ${token}` : "";

  if (!token || authHeader !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  // `force=true` permite disparo manual fuera de ventana horaria.
  const force = url.searchParams.get("force") === "true";

  // Ventana válida: 03:00-03:09 Europe/Madrid.
  const madrid = getMadridHourMinute(new Date());
  const shouldRunByTime = madrid.hour === 3 && madrid.minute >= 0 && madrid.minute < 10;

  if (!force && !shouldRunByTime) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Fuera de ventana 03:00 Europe/Madrid",
      madridHour: madrid.hour,
      madridMinute: madrid.minute,
    });
  }

  const result = await createFullBackup("SCHEDULED", { id: "system-scheduler", role: "SUPER_ADMIN" });

  return NextResponse.json({
    ok: result.status === "SUCCESS",
    skipped: false,
    backupId: result.backupId,
    status: result.status,
    createdAt: result.createdAt,
    durationMs: result.durationMs,
    totalSizeBytes: result.totalSizeBytes,
    checksum: result.checksum,
    failureReason: result.failureReason,
  });
}
