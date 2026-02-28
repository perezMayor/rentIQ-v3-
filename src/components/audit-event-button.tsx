"use client";

import { useEffect, useState } from "react";

type Props = {
  actorId: string;
  actorRole: string;
};

type AuditLogRow = {
  id?: string;
  timestamp: string;
  action: string;
  actorId: string;
  actorRole: string;
  entity: string;
  entityId: string;
};

export function AuditEventButton({ actorId, actorRole }: Props) {
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = actorRole === "SUPER_ADMIN";

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/audit-log");
      const json = (await response.json()) as { items?: AuditLogRow[] };
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  // Dispara un evento manual de prueba para validar la tubería de auditoría.
  const onLog = async () => {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SYSTEM",
        actorId,
        actorRole,
        entity: "dashboard",
        entityId: "manual-event",
        details: { source: "ui-button" },
      }),
    });

    setStatus(response.ok ? "Evento auditado" : "Error de auditoría");
    await loadLogs();
  };

  const onSuppress = async (eventId: string) => {
    if (!isSuperAdmin) return;
    const response = await fetch("/api/audit-log", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    setStatus(response.ok ? "Evento ocultado (borrado lógico)" : "Error al ocultar evento");
    await loadLogs();
  };

  return (
    <div className="stack-sm">
      <button className="primary-btn" onClick={onLog}>
        Registrar evento de auditoría
      </button>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Actor</th>
              {isSuperAdmin ? <th>Borrado lógico</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isSuperAdmin ? 5 : 4} className="muted-text">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={isSuperAdmin ? 5 : 4} className="muted-text">Sin eventos.</td></tr>
            ) : (
              items.slice(0, 25).map((event) => (
                <tr key={event.id || `${event.timestamp}-${event.entity}-${event.entityId}`}>
                  <td>{event.timestamp}</td>
                  <td>{event.action}</td>
                  <td>{event.entity}:{event.entityId}</td>
                  <td>{event.actorRole} / {event.actorId}</td>
                  {isSuperAdmin ? (
                    <td>
                      <button
                        className="secondary-btn"
                        onClick={() => event.id && onSuppress(event.id)}
                        disabled={!event.id}
                        type="button"
                      >
                        Ocultar
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {status ? <p className="muted-text">{status}</p> : null}
    </div>
  );
}
