"use client";

import { useState } from "react";

type Props = {
  children: React.ReactNode;
  deliveryCount: number;
  pickupCount: number;
  taskCount: number;
};

export function MainLayoutFrame({ children, deliveryCount, pickupCount, taskCount }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"entregas" | "recogidas" | "tareas">("entregas");

  function openTab(next: "entregas" | "recogidas" | "tareas") {
    if (open && tab === next) {
      setOpen(false);
      return;
    }
    setTab(next);
    setOpen(true);
  }

  return (
    <div className="main-layout">
      <section className="content-panel">{children}</section>

      <div className="ops-dock-rail">
        <button type="button" className={`ops-dock-tab ${open && tab === "entregas" ? "active" : ""}`} onClick={() => openTab("entregas")}>
          Entregas
        </button>
        <button type="button" className={`ops-dock-tab ${open && tab === "recogidas" ? "active" : ""}`} onClick={() => openTab("recogidas")}>
          Recogidas
        </button>
        <button type="button" className={`ops-dock-tab ${open && tab === "tareas" ? "active" : ""}`} onClick={() => openTab("tareas")}>
          Tareas
        </button>
      </div>

      {open ? (
        <aside className="ops-dock-panel">
          <header className="ops-dock-head">
            <strong>{tab === "entregas" ? "Entregas previstas" : tab === "recogidas" ? "Recogidas previstas" : "Tareas pendientes"}</strong>
            <button type="button" className="ops-dock-close" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="ops-dock-body">
            {tab === "entregas" ? (
              <p className="muted-text">Próximas 7 días: {deliveryCount}</p>
            ) : null}
            {tab === "recogidas" ? (
              <p className="muted-text">Próximas 7 días: {pickupCount}</p>
            ) : null}
            {tab === "tareas" ? (
              <p className="muted-text">Próximas 7 días: {taskCount}</p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
