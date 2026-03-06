// Página del módulo planning-completo.
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompanySettings, listPlanning } from "@/lib/services/rental-service";
import { PlanningCellLink } from "@/app/planning-completo/planning-cell-link";
import styles from "./planning-completo-v2.module.css";

type Props = {
  searchParams: Promise<{ start?: string; period?: string; plate?: string; group?: string; model?: string; branch?: string; selected?: string }>;
};

type CellData = {
  status: "" | "PETICION" | "RESERVA_CONFIRMADA" | "CONTRATADO" | "RESERVA_HUERFANA" | "NO_DISPONIBLE" | "BLOQUEADO";
  selectedId: string;
  reservationId: string;
  groupLabel: string;
  isReservable: boolean;
  openHref: string;
  contractHref: string;
  auditHref: string;
  overlap: boolean;
  title: string;
  segment: "single" | "start" | "middle" | "end" | "none";
};

function parseDateSafe(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildPlanningDays(startDate: string, days: number) {
  const start = parseDateSafe(`${startDate}T00:00:00`) ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayOfWeek = date.getDay();
    return { iso, day, month, isSunday: dayOfWeek === 0, startAt: `${iso}T00:00:00`, endAt: `${iso}T23:59:59` };
  });
}

function overlapsDay(itemStart: string, itemEnd: string, dayStart: string, dayEnd: string) {
  const a1 = parseDateSafe(itemStart);
  const a2 = parseDateSafe(itemEnd);
  const b1 = parseDateSafe(dayStart);
  const b2 = parseDateSafe(dayEnd);
  if (!a1 || !a2 || !b1 || !b2) return false;
  return a1 <= b2 && b1 <= a2;
}

function statusPriority(status: string) {
  const order = ["CONTRATADO", "RESERVA_CONFIRMADA", "PETICION", "RESERVA_HUERFANA", "BLOQUEADO", "NO_DISPONIBLE"];
  const idx = order.indexOf(status);
  return idx === -1 ? 99 : idx;
}

function statusToken(status: CellData["status"]) {
  switch (status) {
    case "PETICION":
      return "peticion";
    case "RESERVA_CONFIRMADA":
      return "confirmada";
    case "CONTRATADO":
      return "contratado";
    case "RESERVA_HUERFANA":
      return "huerfana";
    case "BLOQUEADO":
      return "bloqueado";
    case "NO_DISPONIBLE":
      return "nodisponible";
    default:
      return "vacio";
  }
}

function statusColor(status: CellData["status"]) {
  switch (status) {
    case "PETICION":
      return "#f59f00";
    case "RESERVA_CONFIRMADA":
      return "#2b8a3e";
    case "CONTRATADO":
      return "#d7263d";
    case "RESERVA_HUERFANA":
      return "#8a8f99";
    case "BLOQUEADO":
      return "#7048e8";
    case "NO_DISPONIBLE":
      return "#212529";
    default:
      return "transparent";
  }
}

function buildOpenHref(item: {
  type: "RESERVA" | "BLOQUEO";
  status: string;
  referenceId: string;
  contractId: string | null;
}) {
  if (item.type !== "RESERVA") {
    return "/reservas?tab=planning&planningSubtab=bloqueos";
  }
  if (item.status === "CONTRATADO" && item.contractId) {
    return `/contratos?tab=gestion&contractId=${encodeURIComponent(item.contractId)}`;
  }
  return `/reservas?tab=gestion&reservationId=${encodeURIComponent(item.referenceId)}`;
}

export default async function PlanningCompletoPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const start = params.start ?? today;
  const periodRaw = Number(params.period ?? "30");
  const period = [30, 60, 90].includes(periodRaw) ? periodRaw : 30;
  const plate = params.plate ?? "";
  const group = params.group ?? "";
  const model = params.model ?? "";
  const branch = params.branch ?? "";
  const selected = params.selected ?? "";

  const [planning, companySettings] = await Promise.all([
    listPlanning({
      startDate: start,
      periodDays: period,
      plateFilter: plate,
      groupFilter: group,
      modelFilter: model,
      branchFilter: branch,
    }),
    getCompanySettings(),
  ]);

  const planningDays = buildPlanningDays(start, period);
  const monthHeaders = planningDays.reduce<Array<{ label: string; span: number }>>((acc, day) => {
    const label = `${day.month}/${day.iso.slice(0, 4)}`;
    const last = acc.at(-1);
    if (last && last.label === label) {
      last.span += 1;
      return acc;
    }
    acc.push({ label, span: 1 });
    return acc;
  }, []);

  const rows = planning.flatMap((groupNode) =>
    groupNode.models.flatMap((modelNode) =>
      modelNode.rows.map((row) => {
        const cells: CellData[] = planningDays.map((day) => {
          const dayItems = row.items.filter((item) => overlapsDay(item.startAt, item.endAt, day.startAt, day.endAt));
          if (dayItems.length === 0) {
            return {
              status: "",
              selectedId: "",
              reservationId: "",
              groupLabel: row.items[0]?.groupLabel ?? "",
              isReservable: false,
              openHref: "",
              contractHref: "",
              auditHref: "",
              overlap: false,
              title: "Disponible",
              segment: "none",
            };
          }
          const sorted = dayItems.toSorted((a, b) => statusPriority(a.status) - statusPriority(b.status));
          const main = sorted[0];
          const starts = main.startAt.slice(0, 10) === day.iso;
          const ends = main.endAt.slice(0, 10) === day.iso;
          const segment = starts && ends ? "single" : starts ? "start" : ends ? "end" : "middle";
          return {
            status: main.status,
            selectedId: main.id,
            reservationId: main.type === "RESERVA" ? main.referenceId : "",
            groupLabel: main.groupLabel,
            isReservable: main.type === "RESERVA",
            openHref: buildOpenHref(main),
            contractHref: main.contractId ? `/contratos?tab=gestion&contractId=${encodeURIComponent(main.contractId)}` : "",
            auditHref:
              main.type === "RESERVA"
                ? main.contractId
                  ? `/contratos?tab=historico&auditContractId=${encodeURIComponent(main.contractId)}`
                  : `/reservas?tab=gestion&auditReservationId=${encodeURIComponent(main.referenceId)}`
                : "/reservas?tab=planning&planningSubtab=bloqueos",
            overlap: dayItems.some((item) => item.overlap) || dayItems.length > 1,
            title: `${main.label} | ${main.startAt.slice(0, 16)} -> ${main.endAt.slice(0, 16)}`,
            segment,
          };
        });
        return {
          groupLabel: groupNode.groupLabel,
          modelLabel: modelNode.modelLabel,
          plateLabel: row.rowType === "HUERFANA" ? "Huerfana" : row.vehiclePlate,
          rowType: row.rowType,
          cells,
        };
      }),
    ),
  );

  const allItems = planning.flatMap((g) => g.models.flatMap((m) => m.rows.flatMap((r) => r.items)));
  const selectedItem = allItems.find((item) => item.id === selected) ?? null;

  const leftFleetTree = planning.map((g) => ({
    group: g.groupLabel,
    models: g.models.map((m) => ({ model: m.modelLabel, count: m.rows.length })),
  }));
  const orphanDeficitByGroup = planning
    .map((groupNode) => ({
      group: groupNode.groupLabel,
      deficit: groupNode.models.reduce(
        (sum, modelNode) => sum + modelNode.rows.filter((row) => row.rowType === "HUERFANA").length,
        0,
      ),
    }))
    .filter((item) => item.deficit > 0)
    .toSorted((a, b) => b.deficit - a.deficit || a.group.localeCompare(b.group));

  const baseQuery = `start=${encodeURIComponent(start)}&period=${period}&plate=${encodeURIComponent(plate)}&group=${encodeURIComponent(group)}&model=${encodeURIComponent(model)}&branch=${encodeURIComponent(branch)}`;
  const leftWidth = 160;
  const rightWidth = selectedItem ? 300 : 0;
  const col1 = 52;
  const col2 = 20;
  const col3 = 68;
  const prevStart = new Date(`${start}T00:00:00`);
  prevStart.setDate(prevStart.getDate() - period);
  const nextStart = new Date(`${start}T00:00:00`);
  nextStart.setDate(nextStart.getDate() + period);
  const actionBtnStyle = {
    border: "1px solid #0f56b1",
    background: "#1d69cb",
    color: "#fff",
  } as const;

  return (
    <main className={styles.page}>
      <section
        className={styles.layout}
        style={{ gridTemplateColumns: selectedItem ? `${leftWidth}px 1fr ${rightWidth}px` : `${leftWidth}px 1fr` }}
      >
        <aside className={styles.leftPanel}>
          <div className={styles.office}>
            <label className={styles.officeLabel}>
              Sucursal
              <select form="planning-filters" name="branch" defaultValue={branch}>
                <option value="">Todas</option>
                {(companySettings.branches ?? []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <form id="planning-filters" method="GET" className={styles.filters}>
            <label>
              Inicio
              <input name="start" type="date" defaultValue={start} />
            </label>
            <label>
              Mostrar
              <select name="period" defaultValue={String(period)}>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
                <option value="90">90 días</option>
              </select>
            </label>
            <label>
              Matrícula
              <input name="plate" defaultValue={plate} />
            </label>
            <label>
              Grupo
              <input name="group" defaultValue={group} />
            </label>
            <label>
              Modelo
              <input name="model" defaultValue={model} />
            </label>
            <button type="submit" className={styles.primaryBtn}>Aplicar</button>
          </form>

          <div className={styles.treeWrap}>
            <div className={styles.treeTitle}>FLOTA</div>
            {leftFleetTree.length === 0 ? <p className={styles.muted}>Sin datos</p> : null}
            {leftFleetTree.map((node) => (
              <details key={node.group} open>
                <summary>{node.group}</summary>
                <ul>
                  {node.models.map((modelNode) => (
                    <li key={`${node.group}-${modelNode.model}`}>{modelNode.model} ({modelNode.count})</li>
                  ))}
                </ul>
              </details>
            ))}
            <div className={styles.deficitWrap}>
              <div className={styles.treeTitle}>DÉFICIT POR GRUPO</div>
              {orphanDeficitByGroup.length === 0 ? (
                <p className={styles.muted}>Sin déficit</p>
              ) : (
                <ul className={styles.deficitList}>
                  {orphanDeficitByGroup.map((item) => (
                    <li key={`deficit-${item.group}`}>
                      {item.group} ({item.deficit})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.backLinks}>
            <a
              className={styles.backLink}
              style={actionBtnStyle}
              href={`/reservas?planningStart=${encodeURIComponent(start)}&planningPeriod=${period}&planningPlate=${encodeURIComponent(plate)}&planningGroup=${encodeURIComponent(group)}&planningModel=${encodeURIComponent(model)}&planningBranch=${encodeURIComponent(branch)}`}
            >
              Reservas
            </a>
            <a className={styles.backLink} style={actionBtnStyle} href="/dashboard">
              Dashboard
            </a>
          </div>
        </aside>

        <section className={styles.centerPanel}>
          <div className={styles.quickNav}>
            <a href={`/planning-completo?start=${encodeURIComponent(prevStart.toISOString().slice(0, 10))}&period=${period}&plate=${encodeURIComponent(plate)}&group=${encodeURIComponent(group)}&model=${encodeURIComponent(model)}&branch=${encodeURIComponent(branch)}`}>← Periodo anterior</a>
            <a href={`/planning-completo?start=${encodeURIComponent(today)}&period=${period}&plate=${encodeURIComponent(plate)}&group=${encodeURIComponent(group)}&model=${encodeURIComponent(model)}&branch=${encodeURIComponent(branch)}`}>Hoy</a>
            <a href={`/planning-completo?start=${encodeURIComponent(nextStart.toISOString().slice(0, 10))}&period=${period}&plate=${encodeURIComponent(plate)}&group=${encodeURIComponent(group)}&model=${encodeURIComponent(model)}&branch=${encodeURIComponent(branch)}`}>Periodo siguiente →</a>
          </div>
          <div className={`${styles.legend} ${styles.legendTop}`}>
            <span><i className={`${styles.legendColor} ${styles.status_peticion}`} /> Petición</span>
            <span><i className={`${styles.legendColor} ${styles.status_confirmada}`} /> Reserva</span>
            <span><i className={`${styles.legendColor} ${styles.status_contratado}`} /> Contratado</span>
            <span><i className={`${styles.legendColor} ${styles.status_huerfana}`} /> Huérfana</span>
            <span><i className={`${styles.legendColor} ${styles.status_bloqueado}`} /> Bloqueado</span>
            <span><i className={`${styles.legendColor} ${styles.status_nodisponible}`} /> No disponible</span>
            <span className={styles.legendHint}>Doble clic o doble toque: abrir reserva/contrato</span>
          </div>
          <div className={styles.ganttWrap}>
            <table className={styles.gantt}>
              <thead>
                <tr>
                  <th className={styles.stickyCol} style={{ left: 0, width: col1, minWidth: col1, maxWidth: col1, padding: "0 2px", textAlign: "center" }} rowSpan={2}>Mat</th>
                  <th className={styles.stickyCol} style={{ left: col1, width: col2, minWidth: col2, maxWidth: col2, padding: "0 1px", textAlign: "center" }} rowSpan={2}>Gr</th>
                  <th className={styles.stickyCol} style={{ left: col1 + col2, width: col3, minWidth: col3, maxWidth: col3, padding: "0 2px", textAlign: "center" }} rowSpan={2}>Model.</th>
                  {monthHeaders.map((month, idx) => (
                    <th key={`${month.label}-${idx}`} colSpan={month.span} className={styles.monthHead}>{month.label}</th>
                  ))}
                </tr>
                <tr>
                  {planningDays.map((day) => (
                    <th key={day.iso} className={day.isSunday ? `${styles.dayHead} ${styles.sunday}` : styles.dayHead}>{day.day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`${row.plateLabel}-${row.modelLabel}-${rowIndex}`}>
                    <td className={styles.stickyCol} style={{ left: 0, width: col1, minWidth: col1, maxWidth: col1, padding: "0 2px", textAlign: "center" }}>{row.plateLabel}</td>
                    <td className={styles.stickyCol} style={{ left: col1, width: col2, minWidth: col2, maxWidth: col2, padding: "0 1px", textAlign: "center" }}>{row.groupLabel}</td>
                    <td className={styles.stickyCol} style={{ left: col1 + col2, width: col3, minWidth: col3, maxWidth: col3, padding: "0 2px", textAlign: "center" }}>{row.modelLabel}</td>
                    {row.cells.map((cell, cellIndex) => {
                      const day = planningDays[cellIndex];
                      const isSunday = Boolean(day?.isSunday);
                      const token = statusToken(cell.status);
                      const color = statusColor(cell.status);
                      const selectedClass = cell.selectedId && cell.selectedId === selected ? styles.selectedCell : "";
                      const hasBar = cell.segment !== "none";
                      const dropTargetPlate = row.rowType === "MATRICULA" ? row.plateLabel : "";
                      const interactive = hasBar;
                      return (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className={`${styles.cell} ${isSunday ? styles.sunday : ""} ${selectedClass}`}
                          title={cell.title}
                        >
                          <PlanningCellLink
                            interactive={interactive}
                            hasBar={hasBar}
                            selectHref={
                              cell.selectedId
                                ? `/planning-completo?${baseQuery}&selected=${encodeURIComponent(cell.selectedId)}`
                                : ""
                            }
                            openHref={
                              cell.openHref || (cell.selectedId ? `/planning-completo?${baseQuery}&selected=${encodeURIComponent(cell.selectedId)}` : "")
                            }
                            contractHref={cell.contractHref}
                            auditHref={cell.auditHref}
                            dragReservationId={cell.isReservable ? cell.reservationId : ""}
                            dragStatus={cell.status}
                            dragGroup={cell.groupLabel}
                            dropTargetPlate={dropTargetPlate}
                            dropTargetGroup={row.groupLabel}
                            className={styles.cellLink}
                            title={`${cell.title}${hasBar ? " · Doble clic para abrir" : ""}${dropTargetPlate ? " · Arrastra aquí para reasignar" : ""}`}
                          >
                            {hasBar ? (
                              <span
                                className={`${styles.bar} ${styles[`status_${token}`]} ${styles[`segment_${cell.segment}`]} ${cell.overlap ? styles.overlap : ""}`}
                                style={{ backgroundColor: color, color }}
                              />
                            ) : null}
                          </PlanningCellLink>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className={styles.legend}>
            <span><i className={`${styles.legendColor} ${styles.status_peticion}`} /> Petición</span>
            <span><i className={`${styles.legendColor} ${styles.status_confirmada}`} /> Reserva</span>
            <span><i className={`${styles.legendColor} ${styles.status_contratado}`} /> Contratado</span>
            <span><i className={`${styles.legendColor} ${styles.status_huerfana}`} /> Huérfana</span>
            <span><i className={`${styles.legendColor} ${styles.status_bloqueado}`} /> Bloqueado</span>
            <span><i className={`${styles.legendColor} ${styles.status_nodisponible}`} /> No disponible</span>
          </footer>
        </section>

        {selectedItem ? (
          <aside className={styles.rightPanel}>
            <h3>{selectedItem.type === "BLOQUEO" ? "BLOQUEO" : "RESERVA"}</h3>
            <dl>
              <dt>Referencia</dt>
              <dd>{selectedItem.label}</dd>
              <dt>Estado</dt>
              <dd>{selectedItem.status}</dd>
              <dt>Entrega</dt>
              <dd>{selectedItem.startAt}</dd>
              <dt>Recogida</dt>
              <dd>{selectedItem.endAt}</dd>
              <dt>Matrícula</dt>
              <dd>{selectedItem.vehiclePlate}</dd>
              <dt>Grupo</dt>
              <dd>{selectedItem.groupLabel}</dd>
              <dt>Modelo</dt>
              <dd>{selectedItem.modelLabel}</dd>
            </dl>
            <a className={styles.closePanel} href={`/planning-completo?${baseQuery}`}>Cerrar resumen</a>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
