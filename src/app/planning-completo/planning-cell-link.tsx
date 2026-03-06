"use client";
// Módulo planning-cell-link.tsx.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DragEvent, MouseEvent, ReactNode } from "react";

type Props = {
  interactive?: boolean;
  hasBar?: boolean;
  selectHref: string;
  openHref: string;
  contractHref?: string;
  auditHref?: string;
  className: string;
  title: string;
  dragReservationId?: string;
  dragStatus?: string;
  dragGroup?: string;
  dropTargetPlate?: string;
  dropTargetGroup?: string;
  children: ReactNode;
};

type PlanningDragPayload = {
  reservationId: string;
  status: string;
  group: string;
};

const DRAG_STATUS_ALLOWED = new Set(["PETICION", "RESERVA_CONFIRMADA", "RESERVA_HUERFANA"]);

export function PlanningCellLink({
  interactive = true,
  hasBar = true,
  selectHref,
  openHref,
  contractHref = "",
  auditHref = "",
  className,
  title,
  dragReservationId = "",
  dragStatus = "",
  dragGroup = "",
  dropTargetPlate = "",
  dropTargetGroup = "",
  children,
}: Props) {
  const router = useRouter();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchMs = useRef(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
      }
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menu]);

  function onClick() {
    if (!interactive || !selectHref) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }
    clickTimer.current = setTimeout(() => {
      router.push(selectHref);
      clickTimer.current = null;
    }, 180);
  }

  function onDoubleClick() {
    if (!interactive || !openHref) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    router.push(openHref);
  }

  function onTouchEnd() {
    if (!interactive) return;
    const now = Date.now();
    const diff = now - lastTouchMs.current;
    if (diff > 0 && diff < 300) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      router.push(openHref);
      lastTouchMs.current = 0;
      return;
    }
    lastTouchMs.current = now;
    onClick();
  }

  function onContextMenu(event: MouseEvent<HTMLButtonElement>) {
    if (!interactive) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  }

  function goTo(href: string) {
    if (!href) return;
    setMenu(null);
    router.push(href);
  }

  function onDragStart(event: DragEvent<HTMLButtonElement>) {
    if (!interactive || !hasBar || !dragReservationId || !DRAG_STATUS_ALLOWED.has(dragStatus)) {
      event.preventDefault();
      return;
    }
    const payload: PlanningDragPayload = {
      reservationId: dragReservationId,
      status: dragStatus,
      group: dragGroup,
    };
    event.dataTransfer.setData("application/rentiq-planning", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(event: DragEvent<HTMLButtonElement>) {
    if (!dropTargetPlate) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave() {
    if (dragOver) setDragOver(false);
  }

  async function onDrop(event: DragEvent<HTMLButtonElement>) {
    if (!dropTargetPlate) return;
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData("application/rentiq-planning");
    if (!raw) return;
    let payload: PlanningDragPayload | null = null;
    try {
      payload = JSON.parse(raw) as PlanningDragPayload;
    } catch {
      payload = null;
    }
    if (!payload?.reservationId || !DRAG_STATUS_ALLOWED.has(payload.status)) return;
    const sourceGroup = (payload.group || "").trim().toUpperCase();
    const targetGroup = (dropTargetGroup || "").trim().toUpperCase();
    const isCrossGroup = Boolean(sourceGroup && targetGroup && sourceGroup !== targetGroup);
    if (isCrossGroup) {
      const accepted = window.confirm(
        `Se va a cambiar de grupo (${sourceGroup} → ${targetGroup}). ¿Quieres continuar?`,
      );
      if (!accepted) return;
    }
    try {
      const response = await fetch("/api/planning/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: payload.reservationId,
          targetPlate: dropTargetPlate,
          sourceStatus: payload.status,
          sourceGroup: payload.group,
          targetGroup: dropTargetGroup,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; warning?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "No se ha podido reasignar la reserva");
      }
      if (result.warning) {
        window.alert(result.warning);
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se ha podido reasignar la reserva";
      window.alert(message);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${className}${dragOver ? " planning-drop-over" : ""}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTouchEnd={onTouchEnd}
        onContextMenu={onContextMenu}
        draggable={interactive && hasBar && Boolean(dragReservationId) && DRAG_STATUS_ALLOWED.has(dragStatus)}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        title={title}
        aria-label={title}
      >
        {hasBar ? children : null}
      </button>
      {menu ? (
        <div
          style={{
            position: "fixed",
            top: menu.y,
            left: menu.x,
            zIndex: 120,
            minWidth: 180,
            border: "1px solid #b8c2cf",
            borderRadius: 10,
            background: "#f8fafc",
            boxShadow: "0 10px 24px rgba(15,23,42,0.2)",
            padding: 6,
            display: "grid",
            gap: 4,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="secondary-btn" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => goTo(openHref)}>
            Editar
          </button>
          {contractHref ? (
            <button type="button" className="secondary-btn" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => goTo(contractHref)}>
              Abrir contrato
            </button>
          ) : null}
          {auditHref ? (
            <button type="button" className="secondary-btn" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => goTo(auditHref)}>
              Auditoría
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
