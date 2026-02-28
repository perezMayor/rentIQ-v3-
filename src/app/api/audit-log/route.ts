import { NextResponse } from "next/server";
import { readLatestAuditEvents, suppressAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  // Exposición de últimos eventos para panel de trazabilidad.
  const items = await readLatestAuditEvents(100);
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Permiso denegado" }, { status: 403 });
  }
  const body = (await request.json()) as { eventId?: string; reason?: string };
  const eventId = String(body.eventId ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId obligatorio" }, { status: 400 });
  }
  await suppressAuditEvent({
    targetEventId: eventId,
    actorId: user.id,
    actorRole: user.role,
    reason: body.reason,
  });
  return NextResponse.json({ ok: true });
}
