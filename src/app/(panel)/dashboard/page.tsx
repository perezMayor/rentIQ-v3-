// Página del módulo dashboard.
import { getSelectedBranchId, getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getReservationForecast,
  listContracts,
  listDeliveries,
  listFleetVehicles,
  listInvoices,
  listPickups,
  listReservations,
  listTariffPlans,
  listVehicleCategories,
  listVehicleTaskAlerts,
  listVehicleTasks,
} from "@/lib/services/rental-service";
import { MetricSwitch } from "@/app/(panel)/dashboard/metric-switch";
import styles from "./dashboard.module.css";

type AgendaRow = {
  key: string;
  type: "Entrega" | "Recogida";
  when: string;
  reservationNumber: string;
  reservationId: string;
  contractNumber: string;
  customerName: string;
  branch: string;
  hasContract: boolean;
  vehiclePlate: string;
};

type Props = {
  searchParams: Promise<{ metric?: string; from?: string; to?: string; year?: string; error?: string }>;
};

type SmartAlert = {
  key: string;
  label: string;
  description: string;
  dueDate: string;
  href: string;
  severity: "info" | "warning" | "danger";
};

const SMART_ALERT_DAYS_AHEAD = 2;

function parseIsoDateOnly(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayDiff(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function uniqueCountByReservation(rows: Array<{ reservationId: string }>) {
  return new Set(rows.map((item) => item.reservationId)).size;
}

function parseDateSafe(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function uniqueRowsByReservation(rows: Array<{
  reservationId: string;
  reservationNumber: string;
  hasContract: boolean;
  contractNumber: string;
  customerName: string;
  branch: string;
  datetime: string;
  vehiclePlate: string;
}>) {
  return Array.from(
    new Map(
      rows.map((row) => [
        row.reservationId,
        {
          reservationId: row.reservationId,
          reservationNumber: row.reservationNumber,
          hasContract: row.hasContract,
          contractNumber: row.contractNumber,
          customerName: row.customerName,
          branch: row.branch,
          datetime: row.datetime,
          vehiclePlate: row.vehiclePlate,
        },
      ]),
    ).values(),
  ).toSorted((a, b) => a.datetime.localeCompare(b.datetime));
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const metric = params.metric === "reservas" ? "reservas" : "entregas";
  const permissionAlert =
    params.error === "permission" ? "Este usuario no tiene permiso para realizar esta acción." : null;
  const selectedBranch = await getSelectedBranchId();
  const branchFilter = selectedBranch.trim();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const defaultFromDate = new Date(now);
  defaultFromDate.setDate(defaultFromDate.getDate() - 30);
  const from = params.from ?? defaultFromDate.toISOString().slice(0, 10);
  const to = params.to ?? today;
  const yearParam = Number(params.year ?? "");
  const next24 = new Date(now);
  next24.setHours(next24.getHours() + 24);

  const [
    reservationsRaw,
    contractsRaw,
    deliveriesTodayRaw,
    pickupsTodayRaw,
    deliveriesRangeRaw,
    pickupsRangeRaw,
    deliveriesNextRaw,
    pickupsNextRaw,
    taskAlerts,
    allVehicleTasks,
    allInvoices,
    forecastRaw,
    fleetRaw,
    categoriesRaw,
    tariffPlansRaw,
  ] = await Promise.all([
    listReservations(""),
    listContracts(""),
    listDeliveries({ from: `${today}T00:00:00`, to: `${today}T23:59:59`, branch: branchFilter }),
    listPickups({ from: `${today}T00:00:00`, to: `${today}T23:59:59`, branch: branchFilter }),
    listDeliveries({ from: `${from}T00:00:00`, to: `${to}T23:59:59`, branch: branchFilter }),
    listPickups({ from: `${from}T00:00:00`, to: `${to}T23:59:59`, branch: branchFilter }),
    listDeliveries({ from: now.toISOString(), to: next24.toISOString(), branch: branchFilter }),
    listPickups({ from: now.toISOString(), to: next24.toISOString(), branch: branchFilter }),
    listVehicleTaskAlerts({ daysAhead: 7 }),
    listVehicleTasks({}),
    listInvoices(""),
    getReservationForecast({ from, to }),
    listFleetVehicles(),
    listVehicleCategories(),
    listTariffPlans(""),
  ]);

  const reservations = branchFilter
    ? reservationsRaw.filter((item) => item.branchDelivery.toLowerCase().includes(branchFilter))
    : reservationsRaw;
  const contracts = branchFilter
    ? contractsRaw.filter((item) => item.branchCode.toLowerCase().includes(branchFilter))
    : contractsRaw;

  const reservationsToday = reservations.filter((item) => item.deliveryAt.slice(0, 10) === today).length;
  const pendingReservations = reservations.filter((item) => item.reservationStatus === "PETICION").length;
  const openContracts = contracts.filter((item) => item.status === "ABIERTO");
  const contractsWithoutPlate = openContracts.filter((item) => !item.vehiclePlate).length;

  const deliveriesToday = uniqueCountByReservation([
    ...deliveriesTodayRaw.withContract,
    ...deliveriesTodayRaw.withoutContract,
  ]);
  const pickupsToday = uniqueCountByReservation([...pickupsTodayRaw.withContract, ...pickupsTodayRaw.withoutContract]);
  const fleet = fleetRaw;
  const occupiedToday = new Set(
    reservations
      .filter((item) => item.assignedPlate && item.deliveryAt <= `${today}T23:59:59` && item.pickupAt >= `${today}T00:00:00`)
      .map((item) => item.assignedPlate.toUpperCase()),
  ).size;
  const occupancy = fleet.length > 0 ? Math.round((occupiedToday / fleet.length) * 100) : 0;
  const confirmedOrContracted = reservations.filter((item) => item.reservationStatus === "CONFIRMADA" || Boolean(item.contractId)).length;
  const conversion = reservations.length > 0 ? Math.round((confirmedOrContracted / reservations.length) * 100) : 0;

  const configuredGroups = Array.from(
    new Set(categoriesRaw.map((category) => category.code || category.name).filter(Boolean)),
  );
  const fallbackGroups = configuredGroups.length > 0 ? configuredGroups : ["A", "B", "C"];
  const forecast = (forecastRaw.length > 0
    ? forecastRaw
    : fallbackGroups.map((group) => ({ group, required: 0, available: 0, deficit: 0 }))
  ).slice(0, 8);
  const forecastBalance = forecast.map((row) => ({
    ...row,
    balance: row.available - row.required,
  }));
  const forecastTotalBalance = forecastBalance.reduce((sum, row) => sum + row.balance, 0);
  const maxForecastAbs = Math.max(1, ...forecastBalance.map((row) => Math.abs(row.balance)));

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const yearOptions = Array.from(
    new Set(
      reservations.flatMap((item) => {
        const years: number[] = [];
        const createdYear = new Date(item.createdAt).getFullYear();
        const deliveryYear = new Date(item.deliveryAt).getFullYear();
        if (!Number.isNaN(createdYear)) years.push(createdYear);
        if (!Number.isNaN(deliveryYear)) years.push(deliveryYear);
        return years;
      }),
    ),
  )
    .filter((year) => Number.isFinite(year))
    .toSorted((a, b) => b - a);
  const currentYear = now.getFullYear();
  const selectedYear = yearOptions.includes(yearParam) ? yearParam : currentYear;
  const monthlyDeliveries = monthNames.map((name, index) => {
    const total = reservations.filter((item) => {
      const date = new Date(metric === "reservas" ? item.createdAt : item.deliveryAt);
      if (Number.isNaN(date.getTime())) return false;
      return date.getFullYear() === selectedYear && date.getMonth() === index;
    }).length;
    return { label: name, total };
  });
  const maxMonthly = Math.max(10, ...monthlyDeliveries.map((item) => item.total));

  const agendaMap = new Map<string, AgendaRow>();
  for (const row of deliveriesNextRaw.withContract) {
    agendaMap.set(`DELIVERY-${row.reservationId}`, {
      key: `DELIVERY-${row.reservationId}`,
      type: "Entrega",
      when: row.datetime,
      reservationNumber: row.reservationNumber,
      reservationId: row.reservationId,
      contractNumber: row.contractNumber,
      customerName: row.customerName,
      branch: row.branch,
      hasContract: row.hasContract,
      vehiclePlate: row.vehiclePlate,
    });
  }
  for (const row of deliveriesNextRaw.withoutContract) {
    const key = `DELIVERY-${row.reservationId}`;
    if (!agendaMap.has(key)) {
      agendaMap.set(key, {
        key,
        type: "Entrega",
        when: row.datetime,
        reservationNumber: row.reservationNumber,
        reservationId: row.reservationId,
        contractNumber: row.contractNumber,
        customerName: row.customerName,
        branch: row.branch,
        hasContract: row.hasContract,
        vehiclePlate: row.vehiclePlate,
      });
    }
  }
  for (const row of pickupsNextRaw.withContract) {
    agendaMap.set(`PICKUP-${row.reservationId}`, {
      key: `PICKUP-${row.reservationId}`,
      type: "Recogida",
      when: row.datetime,
      reservationNumber: row.reservationNumber,
      reservationId: row.reservationId,
      contractNumber: row.contractNumber,
      customerName: row.customerName,
      branch: row.branch,
      hasContract: row.hasContract,
      vehiclePlate: row.vehiclePlate,
    });
  }
  for (const row of pickupsNextRaw.withoutContract) {
    const key = `PICKUP-${row.reservationId}`;
    if (!agendaMap.has(key)) {
      agendaMap.set(key, {
        key,
        type: "Recogida",
        when: row.datetime,
        reservationNumber: row.reservationNumber,
        reservationId: row.reservationId,
        contractNumber: row.contractNumber,
        customerName: row.customerName,
        branch: row.branch,
        hasContract: row.hasContract,
        vehiclePlate: row.vehiclePlate,
      });
    }
  }

  const agenda = Array.from(agendaMap.values())
    .toSorted((a, b) => a.when.localeCompare(b.when))
    .slice(0, 8);

  const deliveriesList = uniqueRowsByReservation([...deliveriesRangeRaw.withContract, ...deliveriesRangeRaw.withoutContract]).slice(0, 8);
  const pickupsCandidates = uniqueRowsByReservation([...pickupsRangeRaw.withContract, ...pickupsRangeRaw.withoutContract]);
  const contractStatusByNumber = new Map(contracts.map((contract) => [contract.contractNumber, contract.status]));
  const openPickups = pickupsCandidates
    .filter((row) => {
      if (!row.hasContract) return true;
      const status = contractStatusByNumber.get(row.contractNumber);
      return status !== "CERRADO";
    })
    .slice(0, 8);

  const operations = taskAlerts
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);
  const openOverdueContracts = contracts
    .filter((contract) => contract.status === "ABIERTO" && parseDateSafe(contract.pickupAt) && parseDateSafe(contract.pickupAt)! < now)
    .slice(0, 8);
  const overdueTasks = allVehicleTasks
    .filter((task) => task.status !== "COMPLETADA" && task.status !== "CANCELADA" && parseDateSafe(`${task.dueDate}T23:59:59`) && parseDateSafe(`${task.dueDate}T23:59:59`)! < now)
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);
  const confirmedWithoutRate = reservations
    .filter((reservation) => reservation.reservationStatus === "CONFIRMADA" && !reservation.appliedRate.trim())
    .slice(0, 8);
  const draftInvoices = allInvoices.filter((invoice) => invoice.status === "BORRADOR").slice(0, 8);

  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const vehicleEndAlerts: SmartAlert[] = fleet
    .filter((vehicle) => !vehicle.deactivatedAt && Boolean(vehicle.activeUntil))
    .flatMap((vehicle) => {
      const due = parseIsoDateOnly(vehicle.activeUntil);
      if (!due) return [];
      const diff = dayDiff(todayDate, due);
      if (diff > SMART_ALERT_DAYS_AHEAD) return [];
      const severity: SmartAlert["severity"] = diff < 0 ? "danger" : diff === 0 ? "warning" : "info";
      const remainingText =
        diff < 0 ? `vencida hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? "" : "s"}` : diff === 0 ? "vence hoy" : `vence en ${diff} día${diff === 1 ? "" : "s"}`;
      return [
        {
          key: `vehicle-end-${vehicle.id}`,
          label: "Baja vehículo",
          description: `${vehicle.plate} · ${remainingText}`,
          dueDate: vehicle.activeUntil,
          href: "/vehiculos?tab=altas-bajas",
          severity,
        },
      ];
    });

  const tariffExpiryAlerts: SmartAlert[] = tariffPlansRaw
    .filter((plan) => plan.active && Boolean(plan.validTo))
    .flatMap((plan) => {
      const due = parseIsoDateOnly(plan.validTo);
      if (!due) return [];
      const diff = dayDiff(todayDate, due);
      if (diff > SMART_ALERT_DAYS_AHEAD) return [];
      const severity: SmartAlert["severity"] = diff < 0 ? "danger" : diff === 0 ? "warning" : "info";
      const remainingText =
        diff < 0 ? `vencida hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? "" : "s"}` : diff === 0 ? "vence hoy" : `vence en ${diff} día${diff === 1 ? "" : "s"}`;
      return [
        {
          key: `tariff-end-${plan.id}`,
          label: "Cambio tarifa",
          description: `${plan.code} · ${remainingText}`,
          dueDate: plan.validTo,
          href: `/tarifas?tariffPlanId=${encodeURIComponent(plan.id)}`,
          severity,
        },
      ];
    });

  const smartAlerts = [...tariffExpiryAlerts, ...vehicleEndAlerts]
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 12);

  const kpis = [
    { label: "Entregas hoy", value: String(deliveriesToday) },
    { label: "Recogidas hoy", value: String(pickupsToday) },
    { label: "Tareas pendientes", value: String(taskAlerts.length) },
  ];

  const agendaSummary = [
    { label: "Reservas hoy", value: String(reservationsToday) },
    { label: "Contratos abiertos", value: String(openContracts.length) },
    { label: "Reservas sin confirmar", value: String(pendingReservations) },
    {
      label: "Reservas huérfanas",
      value: String(
        reservations.filter((item) => item.reservationStatus === "CONFIRMADA" && !item.assignedPlate).length,
      ),
    },
    { label: "Contratos sin matrícula", value: String(contractsWithoutPlate) },
    { label: "Entregas hoy sin contrato", value: String(deliveriesTodayRaw.withoutContract.filter((item) => !item.hasContract).length) },
    { label: "Ocupación flota hoy", value: `${occupancy}%` },
    { label: "Confirmación / petición", value: `${conversion}%` },
    { label: "Movimientos próximas 24h", value: String(agenda.length) },
    { label: "Grupos con déficit (rango)", value: String(forecastBalance.filter((row) => row.balance < 0).length) },
    { label: "Flota activa", value: String(fleet.length) },
  ];
  const quickLinks = [
    { href: "/reservas?tab=gestion", label: "Nueva reserva" },
    { href: "/contratos?tab=gestion", label: "Nuevo contrato" },
    { href: "/reservas?tab=presupuestos", label: "Presupuesto" },
    { href: "/reservas?tab=planning", label: "Planning" },
    { href: "/gastos", label: "Gastos" },
    ...(user.role === "LECTOR" ? [] : [{ href: "/facturacion?tab=facturas", label: "Facturación" }]),
  ];
  const blockedQuickLinks = new Set(["/reservas?tab=gestion", "/contratos?tab=gestion", "/reservas?tab=planning"]);

  return (
    <div className={styles.root} aria-label="dashboard-operativo">
      {permissionAlert ? <p className="danger-text">{permissionAlert}</p> : null}
      <section className={`card ${styles.kpiPanel}`}>
        <div className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <article key={kpi.label} className={styles.kpiCard}>
              <p className={styles.kpiLabel}>{kpi.label}</p>
              <p className={styles.kpiValue}>{kpi.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.middleGrid}>
        <section className={`card stack-sm ${styles.sectionCard}`}>
          <div className="table-header-row">
            <h3 className={styles.sectionTitle}>Agenda</h3>
            <div className={styles.agendaActions}>
              <a className={styles.smallChip} href="/reservas?tab=entregas">Reservas</a>
              <a className={styles.smallChip} href="/contratos?tab=historico">Contratos</a>
            </div>
          </div>
          <div className={styles.agendaSummaryGrid}>
            {agendaSummary.map((item) => (
              <article key={item.label} className={styles.agendaSummaryCard}>
                <p className={styles.alertLabel}>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          {agenda.length > 0 ? (
            <div className={styles.agendaList}>
              {agenda.map((row) => (
                <article key={row.key} className={styles.agendaItem}>
                  <p className={styles.agendaTime}>{row.when.replace("T", " ").slice(0, 16)}</p>
                  <div className={styles.agendaMain}>
                    <strong>{row.type}</strong>
                    <span>{row.customerName}</span>
                    <span className="muted-text">{row.reservationNumber} · {row.branch}</span>
                  </div>
                  <p className={styles.agendaStatus}>{row.hasContract ? (row.vehiclePlate ? row.vehiclePlate : "Sin matrícula") : "Sin contrato"}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className={`card stack-sm ${styles.sectionCard}`}>
          <h3 className={styles.sectionTitle}>Alertas</h3>
          <details className={styles.alertDisclosure} open>
            <summary className={styles.alertSummary}>
              <span>Automáticas</span>
              <strong>{smartAlerts.length}</strong>
            </summary>
            {smartAlerts.length === 0 ? (
              <p className={styles.alertEmpty}>Sin alertas automáticas en los próximos {SMART_ALERT_DAYS_AHEAD} días.</p>
            ) : (
              <div className={styles.alertGrid}>
                {smartAlerts.map((alert) => (
                  <a key={alert.key} className={`${styles.alertCard} ${styles[`alertCard${alert.severity === "danger" ? "Danger" : alert.severity === "warning" ? "Warning" : "Info"}`]}`} href={alert.href}>
                    <span>{alert.description}</span>
                    <strong>{alert.label}</strong>
                  </a>
                ))}
              </div>
            )}
          </details>
          <details className={styles.alertDisclosure} open>
            <summary className={styles.alertSummary}>
              <span>Recogidas</span>
              <strong>{openPickups.length}</strong>
            </summary>
            {openPickups.length === 0 ? (
              <p className={styles.alertEmpty}>Sin recogidas pendientes.</p>
            ) : (
              <div className={styles.alertGrid}>
                {openPickups.map((row) => (
                  <a
                    key={`pickup-${row.reservationId}`}
                    className={styles.alertCard}
                    href={
                      row.hasContract && row.contractNumber
                        ? `/contratos?tab=gestion&contractNumber=${encodeURIComponent(row.contractNumber)}`
                        : `/reservas?tab=gestion&reservationId=${encodeURIComponent(row.reservationId)}`
                    }
                  >
                    <span>
                      {row.datetime.slice(0, 16).replace("T", " ")} · {row.customerName}
                    </span>
                    <strong>{row.hasContract ? row.contractNumber : row.reservationNumber}</strong>
                  </a>
                ))}
              </div>
            )}
          </details>

          <details className={styles.alertDisclosure}>
            <summary className={styles.alertSummary}>
              <span>Entregas</span>
              <strong>{deliveriesList.length}</strong>
            </summary>
            {deliveriesList.length === 0 ? (
              <p className={styles.alertEmpty}>Sin entregas registradas hoy.</p>
            ) : (
              <div className={styles.alertGrid}>
                {deliveriesList.map((row) => (
                  <a
                    key={`delivery-${row.reservationId}`}
                    className={styles.alertCard}
                    href={
                      row.hasContract && row.contractNumber
                        ? `/contratos?tab=gestion&contractNumber=${encodeURIComponent(row.contractNumber)}`
                        : `/reservas?tab=gestion&reservationId=${encodeURIComponent(row.reservationId)}`
                    }
                  >
                    <span>
                      {row.datetime.slice(0, 16).replace("T", " ")} · {row.customerName}
                    </span>
                    <strong>{row.hasContract ? row.contractNumber : row.reservationNumber}</strong>
                  </a>
                ))}
              </div>
            )}
          </details>

          <details className={styles.alertDisclosure}>
            <summary className={styles.alertSummary}>
              <span>Operaciones</span>
              <strong>{operations.length}</strong>
            </summary>
            {operations.length === 0 ? (
              <p className={styles.alertEmpty}>Sin mantenimientos próximos.</p>
            ) : (
              <div className={styles.alertGrid}>
                {operations.map((task) => (
                  <a key={task.id} className={styles.alertCard} href="/vehiculos?tab=tareas">
                    <span>{task.dueDate} · {task.title}</span>
                    <strong>{task.plate}</strong>
                  </a>
                ))}
              </div>
            )}
          </details>

          <details className={styles.alertDisclosure}>
            <summary className={styles.alertSummary}>
              <span>Riesgos operativos</span>
              <strong>{openOverdueContracts.length + overdueTasks.length + confirmedWithoutRate.length + draftInvoices.length}</strong>
            </summary>
            {openOverdueContracts.length + overdueTasks.length + confirmedWithoutRate.length + draftInvoices.length === 0 ? (
              <p className={styles.alertEmpty}>Sin riesgos críticos detectados.</p>
            ) : (
              <div className={styles.alertGrid}>
                {openOverdueContracts.map((contract) => (
                  <a key={`risk-contract-${contract.id}`} className={`${styles.alertCard} ${styles.alertCardDanger}`} href={`/contratos?tab=gestion&contractNumber=${encodeURIComponent(contract.contractNumber)}`}>
                    <span>Contrato abierto vencido · {contract.pickupAt.slice(0, 16).replace("T", " ")}</span>
                    <strong>{contract.contractNumber}</strong>
                  </a>
                ))}
                {overdueTasks.map((task) => (
                  <a key={`risk-task-${task.id}`} className={`${styles.alertCard} ${styles.alertCardDanger}`} href="/vehiculos?tab=tareas">
                    <span>Tarea vencida · {task.dueDate} · {task.title}</span>
                    <strong>{task.plate}</strong>
                  </a>
                ))}
                {confirmedWithoutRate.map((reservation) => (
                  <a key={`risk-rate-${reservation.id}`} className={`${styles.alertCard} ${styles.alertCardWarning}`} href={`/reservas?tab=gestion&reservationId=${encodeURIComponent(reservation.id)}`}>
                    <span>Reserva confirmada sin tarifa aplicada</span>
                    <strong>{reservation.reservationNumber}</strong>
                  </a>
                ))}
                {draftInvoices.map((invoice) => (
                  <a key={`risk-invoice-${invoice.id}`} className={`${styles.alertCard} ${styles.alertCardInfo}`} href="/facturacion?tab=facturas">
                    <span>Factura en borrador pendiente de cierre fiscal</span>
                    <strong>{invoice.invoiceNumber}</strong>
                  </a>
                ))}
              </div>
            )}
          </details>
        </section>
      </div>

      <div className={styles.middleGrid}>
        <section className={`card stack-sm ${styles.sectionCard}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Resumen mensual</h3>
            <div className={styles.metricSwitch}>
              <MetricSwitch metric={metric} className={styles.metricChip} activeClassName={styles.metricChipActive} />
            </div>
          </div>
          <form method="GET" className={styles.yearFilterRow}>
            <input type="hidden" name="metric" value={metric} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <label className={styles.yearInlineField}>
              <span>Año</span>
              <select name="year" defaultValue={String(selectedYear)}>
                {(yearOptions.length > 0 ? yearOptions : [selectedYear]).map((year) => (
                  <option key={`year-${year}`} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <button className={styles.metricApply} type="submit">Aplicar</button>
          </form>
          <div className={styles.monthlyChart}>
            {monthlyDeliveries.map((item) => (
              <div key={item.label} className={styles.monthlyRow}>
                <span className={styles.monthlyLabel}>{item.label}</span>
                <div className={styles.monthlyTrack} title={`${item.label}: ${item.total}`}>
                  <div
                    className={styles.monthlyFill}
                    style={{
                      width:
                        item.total === 0
                          ? "0%"
                          : `${Math.round((item.total / maxMonthly) * 100)}%`,
                      minWidth: item.total > 0 ? "8px" : "0",
                    }}
                  />
                  <span className={styles.monthlyValue}>{item.total}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`card stack-sm ${styles.sectionCard}`}>
          <h3 className={styles.sectionTitle}>Previsión</h3>
          <form method="GET" className={styles.metricFilterRow}>
            <input type="hidden" name="metric" value={metric} />
            <label className={styles.metricFilterField}>
              Desde
              <input type="date" name="from" defaultValue={from} />
            </label>
            <label className={styles.metricFilterField}>
              Hasta
              <input type="date" name="to" defaultValue={to} />
            </label>
            <button className={styles.metricApply} type="submit">Aplicar</button>
          </form>
          <div className={styles.forecastTotalRow}>
            <span>Saldo global</span>
            <strong className={forecastTotalBalance < 0 ? styles.totalNegative : styles.totalPositive}>
              {forecastTotalBalance > 0 ? `+${forecastTotalBalance}` : forecastTotalBalance}
            </strong>
          </div>
          <div className={styles.forecastChart}>
            {forecastBalance.length === 0 ? (
              <p className={styles.alertEmpty}>Sin datos de previsión.</p>
            ) : (
              <>
                {forecastBalance.map((row) => (
                  <div key={row.group} className={styles.forecastChartRow}>
                    <span className={styles.forecastChartLabel}>{row.group}</span>
                    <div className={styles.forecastChartTrack}>
                      <div
                        className={
                          row.balance < 0
                            ? styles.forecastBarNegative
                            : row.balance > 0
                              ? styles.forecastBarPositive
                              : styles.forecastBarZero
                        }
                        style={{
                          width:
                            row.balance === 0
                              ? "12%"
                              : `${Math.max(8, Math.round((Math.abs(row.balance) / maxForecastAbs) * 100))}%`,
                          minWidth: "8px",
                        }}
                      />
                    </div>
                    <strong
                      className={
                        row.balance < 0 ? styles.totalNegative : row.balance > 0 ? styles.totalPositive : styles.forecastNeutral
                      }
                    >
                      {row.balance > 0 ? `+${row.balance}` : row.balance}
                    </strong>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      </div>

      <section className={`card stack-sm ${styles.sectionCard}`}>
        <h3 className={styles.sectionTitle}>Accesos rápidos</h3>
        <div className={styles.quickGrid}>
          {quickLinks.map((item) => (
            <a
              key={item.href}
              className={styles.chip}
              href={user.role === "LECTOR" && blockedQuickLinks.has(item.href) ? "/dashboard?error=permission" : item.href}
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
