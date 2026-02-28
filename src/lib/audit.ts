import { mkdir, appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getDataDir } from "@/lib/data-dir";

// Acciones auditables permitidas. Se mantiene explícito para trazabilidad.
export type AuditAction =
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "UI_OPEN_MODULE"
  | "RBAC_DENIED"
  | "OVERRIDE_CONFIRMATION"
  | "SYSTEM"
  | "AUDIT_SUPPRESS";

export type AuditEvent = {
  id?: string;
  timestamp: string;
  action: AuditAction;
  actorId: string;
  actorRole: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
};

const auditDir = getDataDir();
const auditFile = path.join(auditDir, "audit-log.jsonl");

// Escribe evento en formato JSONL append-only (una línea por evento).
export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  await mkdir(auditDir, { recursive: true });
  const normalized: AuditEvent = {
    ...event,
    id: event.id || crypto.randomUUID(),
  };
  await appendFile(auditFile, `${JSON.stringify(normalized)}\n`, "utf8");
}

function parseAuditEvents(rawContent: string): AuditEvent[] {
  const lines = rawContent.split("\n").filter(Boolean);
  const parsed = lines.map((line) => JSON.parse(line) as Partial<AuditEvent>);
  const normalized = parsed.map((event) => ({
    id: event.id || crypto.randomUUID(),
    timestamp: event.timestamp || new Date().toISOString(),
    action: (event.action as AuditAction) || "SYSTEM",
    actorId: event.actorId || "system",
    actorRole: event.actorRole || "SYSTEM",
    entity: event.entity || "unknown",
    entityId: event.entityId || "",
    details: event.details ?? {},
  }));
  return normalized;
}

function buildSuppressedIdSet(events: AuditEvent[]): Set<string> {
  return new Set(
    events
      .filter((event) => event.action === "AUDIT_SUPPRESS" && event.entity === "audit_event")
      .map((event) => String(event.details?.targetEventId ?? ""))
      .filter(Boolean),
  );
}

function visibleAuditEvents(events: AuditEvent[]): AuditEvent[] {
  const suppressed = buildSuppressedIdSet(events);
  return events.filter((event) => {
    if (event.action === "AUDIT_SUPPRESS" && event.entity === "audit_event") {
      return false;
    }
    if (event.id && suppressed.has(event.id)) {
      return false;
    }
    return true;
  });
}

// Recupera los últimos eventos ordenados del más reciente al más antiguo.
export async function readLatestAuditEvents(limit = 100): Promise<AuditEvent[]> {
  try {
    const content = await readFile(auditFile, "utf8");
    return visibleAuditEvents(parseAuditEvents(content))
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

export async function readAllAuditEvents(input?: { includeSuppressed?: boolean }): Promise<AuditEvent[]> {
  try {
    const content = await readFile(auditFile, "utf8");
    const parsed = parseAuditEvents(content);
    if (input?.includeSuppressed) {
      return parsed;
    }
    return visibleAuditEvents(parsed);
  } catch {
    return [];
  }
}

export async function readAuditEventsByReservation(input: {
  reservationId: string;
  contractId?: string | null;
  limit?: number;
}): Promise<AuditEvent[]> {
  try {
    const content = await readFile(auditFile, "utf8");
    const reservationId = input.reservationId;
    const contractId = input.contractId ?? "";
    const limit = input.limit ?? 200;

    const matched = visibleAuditEvents(parseAuditEvents(content))
      .filter((event) => {
        if (event.entityId === reservationId) {
          return true;
        }
        if (contractId && event.entityId === contractId) {
          return true;
        }
        const details = event.details ?? {};
        const sourceReservationId = String(details.sourceReservationId ?? "");
        const detailsReservationId = String(details.reservationId ?? "");
        return sourceReservationId === reservationId || detailsReservationId === reservationId;
      });

    return matched.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export async function readAuditEventsByContract(input: {
  contractId: string;
  reservationId?: string | null;
  limit?: number;
}): Promise<AuditEvent[]> {
  try {
    const content = await readFile(auditFile, "utf8");
    const contractId = input.contractId;
    const reservationId = input.reservationId ?? "";
    const limit = input.limit ?? 200;

    const matched = visibleAuditEvents(parseAuditEvents(content))
      .filter((event) => {
        if (event.entityId === contractId) {
          return true;
        }
        const details = event.details ?? {};
        const detailsContractId = String(details.contractId ?? "");
        const sourceContractId = String(details.sourceContractId ?? "");
        if (detailsContractId === contractId || sourceContractId === contractId) {
          return true;
        }
        if (reservationId) {
          if (event.entityId === reservationId) {
            return true;
          }
          const sourceReservationId = String(details.sourceReservationId ?? "");
          const detailsReservationId = String(details.reservationId ?? "");
          return sourceReservationId === reservationId || detailsReservationId === reservationId;
        }
        return false;
      });

    return matched.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export async function suppressAuditEvent(input: {
  targetEventId: string;
  actorId: string;
  actorRole: string;
  reason?: string;
}): Promise<void> {
  const targetId = input.targetEventId.trim();
  if (!targetId) {
    throw new Error("ID de evento obligatorio");
  }
  await appendAuditEvent({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: "AUDIT_SUPPRESS",
    actorId: input.actorId,
    actorRole: input.actorRole,
    entity: "audit_event",
    entityId: targetId,
    details: {
      targetEventId: targetId,
      reason: input.reason?.trim() || "SUPRESION_LOGICA",
    },
  });
}
