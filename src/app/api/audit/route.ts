import { NextResponse } from "next/server";
import { appendAuditEvent, type AuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  // Endpoint genérico para eventos de auditoría disparados desde UI.
  const body = (await request.json()) as {
    action: AuditAction;
    actorId: string;
    actorRole: string;
    entity: string;
    entityId: string;
    details?: Record<string, unknown>;
  };

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: body.action,
    actorId: body.actorId,
    actorRole: body.actorRole,
    entity: body.entity,
    entityId: body.entityId,
    details: body.details,
  });

  return NextResponse.json({ ok: true });
}
