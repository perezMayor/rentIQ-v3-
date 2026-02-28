import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  addSalesChannel,
  assignPlateToReservation,
  convertReservationToContract,
  createVehicleBlock,
  createReservation,
  getReservationForecast,
  getSalesChannelStats,
  listClients,
  listPlanning,
  listReservationAudit,
  listReservationConfirmationLogs,
  listReservations,
  listSalesChannels,
  listTariffPlans,
  listVehicleExtras,
  listFleetVehicles,
  sendReservationConfirmation,
} from "@/lib/services/rental-service";
import { ReservationForm } from "@/app/(panel)/reservas/reservation-form";

type ReservasTab = "gestion" | "entregas" | "recogidas" | "localizar" | "canales" | "logs" | "planning" | "informes";
type PlanningSubTab = "principal" | "asignacion" | "bloqueos" | "resumen" | "detalle";

type Props = {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    auditReservationId?: string;
    reservationId?: string;
    prefillClientId?: string;
    deliveryFrom?: string;
    deliveryTo?: string;
    deliveryBranch?: string;
    deliveryStatus?: string;
    deliveryType?: string;
    deliveryOrderBy?: string;
    deliveryOrder?: string;
    pickupFrom?: string;
    pickupTo?: string;
    pickupBranch?: string;
    pickupStatus?: string;
    pickupType?: string;
    pickupOrderBy?: string;
    pickupOrder?: string;
    locNumber?: string;
    locPlate?: string;
    locCustomer?: string;
    locFrom?: string;
    locTo?: string;
    locStatus?: string;
    locBranch?: string;
    statsFrom?: string;
    statsTo?: string;
    logFrom?: string;
    logTo?: string;
    planningStart?: string;
    planningPeriod?: string;
    planningPlate?: string;
    planningGroup?: string;
    planningModel?: string;
    planningSubtab?: string;
    planningSelected?: string;
    reportDateField?: string;
    reportFrom?: string;
    reportTo?: string;
    reportChannel?: string;
    reportStatus?: string;
    reportDeliveryBranch?: string;
    reportPickupBranch?: string;
    reportGroup?: string;
    reportCommissioner?: string;
    reportCompany?: string;
    reportOrderBy?: string;
    reportOrder?: string;
  }>;
};

function normalizeTab(value: string): ReservasTab {
  if (value === "entregas" || value === "recogidas" || value === "localizar" || value === "canales" || value === "logs" || value === "planning" || value === "informes") {
    return value;
  }
  return "gestion";
}

function normalizePlanningSubtab(value: string): PlanningSubTab {
  if (value === "asignacion" || value === "bloqueos" || value === "resumen" || value === "detalle") {
    return value;
  }
  return "principal";
}

function parseDateSafe(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function inRange(value: string, from: string, to: string) {
  const date = parseDateSafe(value);
  const fromDate = parseDateSafe(from);
  const toDate = parseDateSafe(to);
  if (!date || !fromDate || !toDate) return false;
  return date >= fromDate && date <= toDate;
}

function reservationStateLabel(input: { contractId: string | null; reservationStatus: "PETICION" | "CONFIRMADA" }) {
  if (input.contractId) return "CONTRATADA";
  return input.reservationStatus === "PETICION" ? "PETICION" : "CONFIRMADA";
}

function defaultDateRange(days = 30) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default async function ReservasPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tab = normalizeTab((params.tab ?? "gestion").toLowerCase());
  const canWrite = user.role !== "LECTOR";
  const today = new Date().toISOString().slice(0, 10);
  const range30 = defaultDateRange(30);
  const range15 = defaultDateRange(15);

  const prefillClientId = params.prefillClientId ?? "";
  const auditReservationId = params.auditReservationId ?? "";
  const reservationId = params.reservationId ?? "";

  const deliveryFrom = params.deliveryFrom ?? range15.from;
  const deliveryTo = params.deliveryTo ?? range15.to;
  const deliveryBranch = params.deliveryBranch ?? "";
  const deliveryStatus = (params.deliveryStatus ?? "TODOS").toUpperCase();
  const deliveryType = (params.deliveryType ?? "TODOS").toUpperCase();
  const deliveryOrderBy = (params.deliveryOrderBy ?? "FECHA").toUpperCase();
  const deliveryOrder = (params.deliveryOrder ?? "ASC").toUpperCase();
  const pickupFrom = params.pickupFrom ?? range15.from;
  const pickupTo = params.pickupTo ?? range15.to;
  const pickupBranch = params.pickupBranch ?? "";
  const pickupStatus = (params.pickupStatus ?? "TODOS").toUpperCase();
  const pickupType = (params.pickupType ?? "TODOS").toUpperCase();
  const pickupOrderBy = (params.pickupOrderBy ?? "FECHA").toUpperCase();
  const pickupOrder = (params.pickupOrder ?? "ASC").toUpperCase();

  const locNumber = params.locNumber ?? "";
  const locPlate = params.locPlate ?? "";
  const locCustomer = params.locCustomer ?? "";
  const locFrom = params.locFrom ?? range30.from;
  const locTo = params.locTo ?? range30.to;
  const locStatus = (params.locStatus ?? "TODOS").toUpperCase();
  const locBranch = params.locBranch ?? "";

  const statsFrom = params.statsFrom ?? range30.from;
  const statsTo = params.statsTo ?? range30.to;
  const logFrom = params.logFrom ?? range30.from;
  const logTo = params.logTo ?? range30.to;

  const planningStart = params.planningStart ?? today;
  const planningPeriodRaw = Number(params.planningPeriod ?? "30");
  const planningPeriod = [30, 60, 90].includes(planningPeriodRaw) ? planningPeriodRaw : 30;
  const planningPlate = params.planningPlate ?? "";
  const planningGroup = params.planningGroup ?? "";
  const planningModel = params.planningModel ?? "";
  const planningSubtab = normalizePlanningSubtab((params.planningSubtab ?? "principal").toLowerCase());
  const planningSelected = params.planningSelected ?? "";
  const planningDirectUrl = `/planning-completo?start=${encodeURIComponent(planningStart)}&period=${planningPeriod}&plate=${encodeURIComponent(planningPlate)}&group=${encodeURIComponent(planningGroup)}&model=${encodeURIComponent(planningModel)}`;

  if (tab === "planning") {
    redirect(planningDirectUrl);
  }

  const reportDateField = (params.reportDateField ?? "CREACION").toUpperCase();
  const reportFrom = params.reportFrom ?? range30.from;
  const reportTo = params.reportTo ?? range30.to;
  const reportChannel = params.reportChannel ?? "";
  const reportStatus = (params.reportStatus ?? "TODOS").toUpperCase();
  const reportDeliveryBranch = params.reportDeliveryBranch ?? "";
  const reportPickupBranch = params.reportPickupBranch ?? "";
  const reportGroup = params.reportGroup ?? "";
  const reportCommissioner = params.reportCommissioner ?? "";
  const reportCompany = params.reportCompany ?? "";
  const reportOrderBy = (params.reportOrderBy ?? "FECHA").toUpperCase();
  const reportOrder = (params.reportOrder ?? "ASC").toUpperCase();

  const [allReservations, tariffPlans, clients, fleet, vehicleExtras, salesChannels, salesChannelStats, forecast, confirmationLogs, planning] =
    await Promise.all([
      listReservations(""),
      listTariffPlans(""),
      listClients("", "TODOS"),
      listFleetVehicles(),
      listVehicleExtras(),
      listSalesChannels(),
      getSalesChannelStats({ from: statsFrom, to: statsTo }),
      getReservationForecast({ from: statsFrom, to: statsTo }),
      listReservationConfirmationLogs({ from: logFrom, to: logTo }),
      listPlanning({
        startDate: planningStart,
        periodDays: planningPeriod,
        plateFilter: planningPlate,
        groupFilter: planningGroup,
        modelFilter: planningModel,
      }),
    ]);

  const prefillClient = prefillClientId ? clients.find((client) => client.id === prefillClientId) ?? null : null;
  const auditItems = auditReservationId ? await listReservationAudit(auditReservationId) : [];
  const selectedReservation = auditReservationId ? allReservations.find((item) => item.id === auditReservationId) ?? null : null;

  const deliveries = allReservations
    .filter((reservation) => inRange(reservation.deliveryAt, `${deliveryFrom}T00:00:00`, `${deliveryTo}T23:59:59`))
    .filter((reservation) => !deliveryBranch || reservation.branchDelivery.toLowerCase().includes(deliveryBranch.toLowerCase()))
    .filter((reservation) => {
      const state = reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus });
      return deliveryStatus === "TODOS" || state === deliveryStatus;
    })
    .filter((reservation) => {
      const hasPlate = Boolean(reservation.assignedPlate);
      if (deliveryType === "CON_MATRICULA") return hasPlate;
      if (deliveryType === "SIN_MATRICULA") return !hasPlate;
      return true;
    })
    .toSorted((a, b) => {
      const left = deliveryOrderBy === "CREACION" ? a.createdAt : a.deliveryAt;
      const right = deliveryOrderBy === "CREACION" ? b.createdAt : b.deliveryAt;
      const cmp = left.localeCompare(right);
      return deliveryOrder === "DESC" ? -cmp : cmp;
    });
  const pickups = allReservations
    .filter((reservation) => inRange(reservation.pickupAt, `${pickupFrom}T00:00:00`, `${pickupTo}T23:59:59`))
    .filter((reservation) => !pickupBranch || reservation.pickupBranch.toLowerCase().includes(pickupBranch.toLowerCase()))
    .filter((reservation) => {
      const state = reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus });
      return pickupStatus === "TODOS" || state === pickupStatus;
    })
    .filter((reservation) => {
      const hasPlate = Boolean(reservation.assignedPlate);
      if (pickupType === "CON_MATRICULA") return hasPlate;
      if (pickupType === "SIN_MATRICULA") return !hasPlate;
      return true;
    })
    .toSorted((a, b) => {
      const left = pickupOrderBy === "CREACION" ? a.createdAt : a.pickupAt;
      const right = pickupOrderBy === "CREACION" ? b.createdAt : b.pickupAt;
      const cmp = left.localeCompare(right);
      return pickupOrder === "DESC" ? -cmp : cmp;
    });

  const locatedReservations = allReservations
    .filter((reservation) => !locNumber || reservation.reservationNumber.toLowerCase().includes(locNumber.toLowerCase()))
    .filter((reservation) => !locPlate || reservation.assignedPlate.toLowerCase().includes(locPlate.toLowerCase()))
    .filter((reservation) => !locCustomer || reservation.customerName.toLowerCase().includes(locCustomer.toLowerCase()))
    .filter((reservation) => !locBranch || reservation.branchDelivery.toLowerCase().includes(locBranch.toLowerCase()))
    .filter((reservation) => inRange(reservation.deliveryAt, `${locFrom}T00:00:00`, `${locTo}T23:59:59`))
    .filter((reservation) => {
      const state = reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus });
      return locStatus === "TODOS" || state === locStatus;
    });

  const channelRows = allReservations
    .filter((reservation) => inRange(reservation.createdAt, `${statsFrom}T00:00:00`, `${statsTo}T23:59:59`))
    .reduce<Record<string, { channel: string; count: number; amount: number }>>((acc, reservation) => {
      const channel = reservation.salesChannel.trim() || "N/D";
      const row = acc[channel] ?? { channel, count: 0, amount: 0 };
      row.count += 1;
      row.amount += reservation.totalPrice;
      acc[channel] = row;
      return acc;
    }, {});
  const channelList = Object.values(channelRows).toSorted((a, b) => b.amount - a.amount || b.count - a.count);
  const totalChannelCount = channelList.reduce((sum, row) => sum + row.count, 0);
  const totalChannelAmount = channelList.reduce((sum, row) => sum + row.amount, 0);

  const reportRows = allReservations
    .filter((reservation) => {
      const dateValue = reportDateField === "ENTREGA" ? reservation.deliveryAt : reportDateField === "RECOGIDA" ? reservation.pickupAt : reservation.createdAt;
      return inRange(dateValue, `${reportFrom}T00:00:00`, `${reportTo}T23:59:59`);
    })
    .filter((reservation) => !reportChannel || reservation.salesChannel.toLowerCase().includes(reportChannel.toLowerCase()))
    .filter((reservation) => !reportDeliveryBranch || reservation.branchDelivery.toLowerCase().includes(reportDeliveryBranch.toLowerCase()))
    .filter((reservation) => !reportPickupBranch || reservation.pickupBranch.toLowerCase().includes(reportPickupBranch.toLowerCase()))
    .filter((reservation) => !reportGroup || reservation.billedCarGroup.toLowerCase().includes(reportGroup.toLowerCase()))
    .filter((reservation) => !reportCommissioner || reservation.customerCommissioner.toLowerCase().includes(reportCommissioner.toLowerCase()))
    .filter((reservation) => !reportCompany || reservation.customerCompany.toLowerCase().includes(reportCompany.toLowerCase()))
    .filter((reservation) => {
      const state = reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus });
      return reportStatus === "TODOS" || state === reportStatus;
    })
    .toSorted((a, b) => {
      const left =
        reportOrderBy === "CREACION"
          ? a.createdAt
          : reportOrderBy === "TOTAL"
            ? String(a.totalPrice).padStart(15, "0")
            : reportDateField === "ENTREGA"
              ? a.deliveryAt
              : reportDateField === "RECOGIDA"
                ? a.pickupAt
                : a.createdAt;
      const right =
        reportOrderBy === "CREACION"
          ? b.createdAt
          : reportOrderBy === "TOTAL"
            ? String(b.totalPrice).padStart(15, "0")
            : reportDateField === "ENTREGA"
              ? b.deliveryAt
              : reportDateField === "RECOGIDA"
                ? b.pickupAt
                : b.createdAt;
      const cmp = left.localeCompare(right);
      return reportOrder === "DESC" ? -cmp : cmp;
    });
  const reportTotal = reportRows.reduce((sum, row) => sum + row.totalPrice, 0);
  const unassignedReservations = allReservations.filter((item) => !item.assignedPlate);
  const planningItems = planning.flatMap((group) => group.models.flatMap((model) => model.rows.flatMap((row) => row.items)));
  const selectedPlanningItem = planningItems.find((item) => item.id === planningSelected) ?? null;
  const planningQueryBase = `planningStart=${encodeURIComponent(planningStart)}&planningPeriod=${planningPeriod}&planningPlate=${encodeURIComponent(planningPlate)}&planningGroup=${encodeURIComponent(planningGroup)}&planningModel=${encodeURIComponent(planningModel)}`;

  async function createReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?tab=gestion&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createReservation(input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect("/reservas?tab=gestion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear reserva";
      redirect(`/reservas?tab=gestion&error=${encodeURIComponent(message)}`);
    }
  }

  async function generateContractFromReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?tab=gestion&error=Permiso+denegado");
    const targetReservationId = String(formData.get("reservationId") ?? "").trim();
    if (!targetReservationId) {
      redirect("/reservas?tab=gestion&error=Reserva+no+indicada");
    }
    const reservations = await listReservations("");
    const reservation = reservations.find((item) => item.id === targetReservationId);
    if (!reservation) {
      redirect("/reservas?tab=gestion&error=Reserva+no+encontrada");
    }
    if (reservation.contractId) {
      redirect("/reservas?tab=gestion&error=La+reserva+ya+tiene+contrato");
    }
    if (reservation.reservationStatus !== "CONFIRMADA") {
      redirect("/reservas?tab=gestion&error=Solo+se+pueden+contratar+reservas+confirmadas");
    }
    try {
      await convertReservationToContract(reservation.id, { id: actor.id, role: actor.role }, { overrideAccepted: "false", overrideReason: "" });
      revalidatePath("/reservas");
      revalidatePath("/contratos");
      redirect("/contratos?tab=gestion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al generar contrato";
      redirect(`/reservas?tab=gestion&error=${encodeURIComponent(message)}`);
    }
  }

  const selectedGestionReservation = reservationId ? allReservations.find((item) => item.id === reservationId) ?? null : null;

  async function sendConfirmationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?error=Permiso+denegado");
    const reservationId = String(formData.get("reservationId") ?? "");
    const tabContext = String(formData.get("tabContext") ?? "gestion");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await sendReservationConfirmation(reservationId, input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      if (tabContext === "logs") {
        redirect(`/reservas?tab=logs&logFrom=${logFrom}&logTo=${logTo}`);
      }
      redirect("/reservas?tab=gestion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al enviar confirmacion";
      redirect(`/reservas?tab=${encodeURIComponent(tabContext)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createSalesChannelAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?tab=canales&error=Permiso+denegado");
    const value = String(formData.get("salesChannelName") ?? "");
    try {
      await addSalesChannel(value, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect(`/reservas?tab=canales&statsFrom=${statsFrom}&statsTo=${statsTo}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear canal";
      redirect(`/reservas?tab=canales&error=${encodeURIComponent(message)}`);
    }
  }

  async function assignPlateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?tab=planning&error=Permiso+denegado");
    const reservationId = String(formData.get("reservationId") ?? "");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await assignPlateToReservation(reservationId, input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      revalidatePath("/planning");
      redirect(`/reservas?tab=planning&planningSubtab=principal&${planningQueryBase}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error asignando matrícula";
      redirect(`/reservas?tab=planning&planningSubtab=asignacion&${planningQueryBase}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createBlockAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?tab=planning&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createVehicleBlock(input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      revalidatePath("/planning");
      redirect(`/reservas?tab=planning&planningSubtab=principal&${planningQueryBase}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando bloqueo";
      redirect(`/reservas?tab=planning&planningSubtab=bloqueos&${planningQueryBase}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Reservas</h2>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}

      <section className="card stack-sm">
        <div className="inline-actions-cell">
          <a className={tab === "gestion" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=gestion">Gestión de reserva</a>
          <a className={tab === "entregas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=entregas">Entregas</a>
          <a className={tab === "recogidas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=recogidas">Recogidas</a>
          <a className={tab === "localizar" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=localizar">Localizar reserva</a>
          <a className={tab === "canales" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=canales">Canales</a>
          <a className={tab === "logs" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=logs">Log confirmaciones</a>
          <a className="secondary-btn text-center" href={planningDirectUrl}>Planning</a>
          <a className={tab === "informes" ? "primary-btn text-center" : "secondary-btn text-center"} href="/reservas?tab=informes">Informes de reserva</a>
        </div>
      </section>

      {tab === "gestion" ? (
        <>
          <section className="card stack-md">
            <h3>Gestión de reserva</h3>
            {!canWrite ? <p className="danger-text">Modo lectura: no puedes crear reservas.</p> : null}
            <ReservationForm
              action={createReservationAction}
              canWrite={canWrite}
              initialClient={
                prefillClient
                  ? {
                      id: prefillClient.id,
                      clientCode: prefillClient.clientCode,
                      clientType: prefillClient.clientType,
                      firstName: prefillClient.firstName,
                      lastName: prefillClient.lastName,
                      companyName: prefillClient.companyName,
                      commissionerName: prefillClient.commissionerName,
                      documentNumber: prefillClient.documentNumber,
                      licenseNumber: prefillClient.licenseNumber,
                      email: prefillClient.email,
                      phone1: prefillClient.phone1,
                      acquisitionChannel: prefillClient.acquisitionChannel,
                    }
                  : null
              }
              tariffOptions={tariffPlans.map((plan) => ({ id: plan.id, code: plan.code, title: plan.title }))}
              clients={clients.map((client) => ({
                id: client.id,
                clientCode: client.clientCode,
                clientType: client.clientType,
                firstName: client.firstName,
                lastName: client.lastName,
                companyName: client.companyName,
                commissionerName: client.commissionerName,
                documentNumber: client.documentNumber,
                licenseNumber: client.licenseNumber,
                email: client.email,
                phone1: client.phone1,
                acquisitionChannel: client.acquisitionChannel,
              }))}
              vehicles={fleet.map((vehicle) => ({
                plate: vehicle.plate,
                groupLabel: vehicle.categoryLabel.split(" - ")[0] || vehicle.categoryLabel,
              }))}
              salesChannels={salesChannels}
              extraOptions={vehicleExtras.filter((item) => item.active)}
            />
          </section>

          {selectedGestionReservation ? (
            <section className="card stack-sm">
              <h3>Reserva cargada</h3>
              <p className="muted-text">
                {selectedGestionReservation.reservationNumber} | {selectedGestionReservation.customerName} | {selectedGestionReservation.reservationStatus}
              </p>
              <p className="muted-text">
                Entrega: {selectedGestionReservation.deliveryAt} | Recogida: {selectedGestionReservation.pickupAt}
              </p>
              {selectedGestionReservation.contractId ? (
                <div className="inline-actions-cell">
                  <p className="muted-text">Ya tiene contrato asociado.</p>
                  <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${encodeURIComponent(selectedGestionReservation.contractId)}`}>
                    Abrir contrato
                  </a>
                </div>
              ) : selectedGestionReservation.reservationStatus === "CONFIRMADA" ? (
                <form action={generateContractFromReservationAction} className="mini-form">
                  <input type="hidden" name="reservationId" value={selectedGestionReservation.id} />
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Generar contrato</button>
                </form>
              ) : (
                <p className="muted-text">Solo se puede generar contrato desde reservas confirmadas.</p>
              )}
            </section>
          ) : null}

          {auditReservationId ? (
            <section className="card stack-sm">
              <div className="table-header-row">
                <h3>Auditoría de reserva</h3>
                <a className="secondary-btn text-center" href="/reservas?tab=gestion">Cerrar auditoría</a>
              </div>
              <p className="muted-text">Reserva: {selectedReservation?.reservationNumber || "N/D"} | Cliente: {selectedReservation?.customerName || "N/D"}</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Rol</th><th>Entidad</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {auditItems.length === 0 ? (
                      <tr><td colSpan={6} className="muted-text">Sin eventos.</td></tr>
                    ) : (
                      auditItems.map((event, index) => (
                        <tr key={`${event.timestamp}-${index}`}>
                          <td>{event.timestamp}</td>
                          <td>{event.action}</td>
                          <td>{event.actorId}</td>
                          <td>{event.actorRole}</td>
                          <td>{event.entity}</td>
                          <td><code>{JSON.stringify(event.details ?? {})}</code></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "entregas" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Entregas</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="entregas" />
              <input name="deliveryFrom" type="date" defaultValue={deliveryFrom} />
              <input name="deliveryTo" type="date" defaultValue={deliveryTo} />
              <input name="deliveryBranch" defaultValue={deliveryBranch} placeholder="Sucursal entrega" />
              <select name="deliveryStatus" defaultValue={deliveryStatus}>
                <option value="TODOS">Estado: Todos</option>
                <option value="PETICION">Petición</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CONTRATADA">Contratada</option>
              </select>
              <select name="deliveryType" defaultValue={deliveryType}>
                <option value="TODOS">Tipos: ambos</option>
                <option value="CON_MATRICULA">Solo con matrícula</option>
                <option value="SIN_MATRICULA">Solo sin matrícula</option>
              </select>
              <select name="deliveryOrderBy" defaultValue={deliveryOrderBy}>
                <option value="FECHA">Ordenar por fecha entrega</option>
                <option value="CREACION">Ordenar por creación</option>
              </select>
              <select name="deliveryOrder" defaultValue={deliveryOrder}>
                <option value="ASC">Ascendente</option>
                <option value="DESC">Descendente</option>
              </select>
              <button className="secondary-btn" type="submit">Aplicar</button>
              <a
                className="secondary-btn text-center"
                href={`/api/reporting/entregas/export?from=${encodeURIComponent(deliveryFrom)}&to=${encodeURIComponent(deliveryTo)}&branch=${encodeURIComponent(deliveryBranch)}`}
              >
                Exportar PDF
              </a>
            </form>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Creación</th>
                  <th>Entrega</th>
                  <th>Sucursal</th>
                  <th>Cliente</th>
                  <th>Matrícula</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr><td colSpan={9} className="muted-text">Sin entregas en rango.</td></tr>
                ) : (
                  deliveries.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.reservationNumber}</td>
                      <td>{reservation.createdAt}</td>
                      <td>{reservation.deliveryAt}</td>
                      <td>{reservation.branchDelivery}</td>
                      <td>{reservation.customerName}</td>
                      <td>{reservation.assignedPlate || "N/D"}</td>
                      <td>{reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus })}</td>
                      <td>{reservation.totalPrice.toFixed(2)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/reservas?tab=gestion&reservationId=${reservation.id}`}>
                          Abrir reserva
                        </a>
                        {reservation.contractId ? (
                          <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${encodeURIComponent(reservation.contractId)}`}>
                            Abrir contrato
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "localizar" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Localizar reserva</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="localizar" />
              <input name="locNumber" defaultValue={locNumber} placeholder="Nº reserva" />
              <input name="locPlate" defaultValue={locPlate} placeholder="Matrícula" />
              <input name="locCustomer" defaultValue={locCustomer} placeholder="Cliente" />
              <input name="locBranch" defaultValue={locBranch} placeholder="Sucursal" />
              <input name="locFrom" type="date" defaultValue={locFrom} />
              <input name="locTo" type="date" defaultValue={locTo} />
              <select name="locStatus" defaultValue={locStatus}>
                <option value="TODOS">Todos</option>
                <option value="PETICION">Petición</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CONTRATADA">Contratada</option>
              </select>
              <button className="secondary-btn" type="submit">Buscar</button>
            </form>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Reserva</th><th>Cliente</th><th>Entrega</th><th>Recogida</th><th>Matrícula</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>
                {locatedReservations.length === 0 ? (
                  <tr><td colSpan={8} className="muted-text">Sin resultados.</td></tr>
                ) : (
                  locatedReservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.reservationNumber}</td>
                      <td>{reservation.customerName}</td>
                      <td>{reservation.deliveryAt}</td>
                      <td>{reservation.pickupAt}</td>
                      <td>{reservation.assignedPlate || "N/D"}</td>
                      <td>{reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus })}</td>
                      <td>{reservation.totalPrice.toFixed(2)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/reservas?tab=gestion&reservationId=${reservation.id}`}>
                          Abrir en gestión
                        </a>
                        {reservation.contractId ? (
                          <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${encodeURIComponent(reservation.contractId)}`}>
                            Abrir contrato
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "recogidas" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Recogidas</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="recogidas" />
              <input name="pickupFrom" type="date" defaultValue={pickupFrom} />
              <input name="pickupTo" type="date" defaultValue={pickupTo} />
              <input name="pickupBranch" defaultValue={pickupBranch} placeholder="Sucursal recogida" />
              <select name="pickupStatus" defaultValue={pickupStatus}>
                <option value="TODOS">Estado: Todos</option>
                <option value="PETICION">Petición</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CONTRATADA">Contratada</option>
              </select>
              <select name="pickupType" defaultValue={pickupType}>
                <option value="TODOS">Tipos: ambos</option>
                <option value="CON_MATRICULA">Solo con matrícula</option>
                <option value="SIN_MATRICULA">Solo sin matrícula</option>
              </select>
              <select name="pickupOrderBy" defaultValue={pickupOrderBy}>
                <option value="FECHA">Ordenar por fecha recogida</option>
                <option value="CREACION">Ordenar por creación</option>
              </select>
              <select name="pickupOrder" defaultValue={pickupOrder}>
                <option value="ASC">Ascendente</option>
                <option value="DESC">Descendente</option>
              </select>
              <button className="secondary-btn" type="submit">Aplicar</button>
              <a
                className="secondary-btn text-center"
                href={`/api/reporting/recogidas/export?from=${encodeURIComponent(pickupFrom)}&to=${encodeURIComponent(pickupTo)}&branch=${encodeURIComponent(pickupBranch)}`}
              >
                Exportar PDF
              </a>
            </form>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Creación</th>
                  <th>Recogida</th>
                  <th>Sucursal</th>
                  <th>Cliente</th>
                  <th>Matrícula</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pickups.length === 0 ? (
                  <tr><td colSpan={9} className="muted-text">Sin recogidas en rango.</td></tr>
                ) : (
                  pickups.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.reservationNumber}</td>
                      <td>{reservation.createdAt}</td>
                      <td>{reservation.pickupAt}</td>
                      <td>{reservation.pickupBranch}</td>
                      <td>{reservation.customerName}</td>
                      <td>{reservation.assignedPlate || "N/D"}</td>
                      <td>{reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus })}</td>
                      <td>{reservation.totalPrice.toFixed(2)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/reservas?tab=gestion&reservationId=${reservation.id}`}>
                          Abrir reserva
                        </a>
                        {reservation.contractId ? (
                          <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${encodeURIComponent(reservation.contractId)}`}>
                            Abrir contrato
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "canales" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Canales</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="canales" />
              <input name="statsFrom" type="date" defaultValue={statsFrom} />
              <input name="statsTo" type="date" defaultValue={statsTo} />
              <button className="secondary-btn" type="submit">Actualizar</button>
            </form>
          </div>
          <form action={createSalesChannelAction} className="mini-form">
            <input name="salesChannelName" placeholder="Nuevo canal" disabled={!canWrite} />
            <button className="secondary-btn" type="submit" disabled={!canWrite}>Añadir canal</button>
          </form>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Canal</th><th>Reservas</th><th>% reservas</th><th>Importe</th><th>% importe</th></tr></thead>
              <tbody>
                {channelList.length === 0 ? (
                  <tr><td colSpan={5} className="muted-text">Sin datos en rango.</td></tr>
                ) : (
                  channelList.map((row) => (
                    <tr key={row.channel}>
                      <td>{row.channel}</td>
                      <td>{row.count}</td>
                      <td>{totalChannelCount > 0 ? ((row.count * 100) / totalChannelCount).toFixed(2) : "0.00"}%</td>
                      <td>{row.amount.toFixed(2)}</td>
                      <td>{totalChannelAmount > 0 ? ((row.amount * 100) / totalChannelAmount).toFixed(2) : "0.00"}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Canal</th><th>Total reservas (servicio)</th></tr></thead>
              <tbody>
                {salesChannelStats.length === 0 ? (
                  <tr><td colSpan={2} className="muted-text">Sin datos.</td></tr>
                ) : (
                  salesChannelStats.map((row) => (
                    <tr key={`svc-${row.channel}`}>
                      <td>{row.channel}</td>
                      <td>{row.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="muted-text">Previsión por grupo ({statsFrom} a {statsTo}):</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Grupo</th><th>Necesarios</th><th>Disponibles</th><th>Déficit</th></tr></thead>
              <tbody>
                {forecast.length === 0 ? (
                  <tr><td colSpan={4} className="muted-text">Sin datos.</td></tr>
                ) : (
                  forecast.map((row) => (
                    <tr key={row.group}>
                      <td>{row.group}</td>
                      <td>{row.required}</td>
                      <td>{row.available}</td>
                      <td>{row.deficit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "logs" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Log de confirmaciones</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="logs" />
              <input name="logFrom" type="date" defaultValue={logFrom} />
              <input name="logTo" type="date" defaultValue={logTo} />
              <button className="secondary-btn" type="submit">Filtrar</button>
            </form>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Reserva</th><th>Cliente</th><th>Fecha envío</th><th>Destino</th><th>Estado</th><th>Reenviar</th><th>Descargar</th></tr></thead>
              <tbody>
                {confirmationLogs.length === 0 ? (
                  <tr><td colSpan={7} className="muted-text">Sin envíos en rango.</td></tr>
                ) : (
                  confirmationLogs.map((log, index) => (
                    <tr key={`${log.reservationId}-${log.sentAt}-${index}`}>
                      <td>{log.reservationNumber}</td>
                      <td>{log.customerName}</td>
                      <td>{log.sentAt}</td>
                      <td>{log.to}</td>
                      <td>{log.status}</td>
                      <td>
                        <form action={sendConfirmationAction}>
                          <input type="hidden" name="reservationId" value={log.reservationId} />
                          <input type="hidden" name="toEmail" value={log.to} />
                          <input type="hidden" name="tabContext" value="logs" />
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Reenviar</button>
                        </form>
                      </td>
                      <td><a className="secondary-btn text-center" href={`/api/reservas/${log.reservationId}/confirmacion/download`}>Descargar</a></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {(tab as string) === "planning" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Planning</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="planning" />
              <input type="hidden" name="planningSubtab" value={planningSubtab} />
              <input name="planningStart" type="date" defaultValue={planningStart} />
              <select name="planningPeriod" defaultValue={String(planningPeriod)}>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
                <option value="90">90 días</option>
              </select>
              <input name="planningPlate" defaultValue={planningPlate} placeholder="Matrícula" />
              <input name="planningGroup" defaultValue={planningGroup} placeholder="Grupo" />
              <input name="planningModel" defaultValue={planningModel} placeholder="Modelo" />
              <button className="secondary-btn" type="submit">Aplicar</button>
              <a
                className="secondary-btn text-center"
                href={`/planning-completo?start=${encodeURIComponent(planningStart)}&period=${planningPeriod}&plate=${encodeURIComponent(planningPlate)}&group=${encodeURIComponent(planningGroup)}&model=${encodeURIComponent(planningModel)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir planning completo
              </a>
            </form>
          </div>
          <div className="inline-actions-cell">
            <a className={planningSubtab === "principal" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/reservas?tab=planning&planningSubtab=principal&${planningQueryBase}`}>Calendario</a>
            <a className={planningSubtab === "asignacion" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/reservas?tab=planning&planningSubtab=asignacion&${planningQueryBase}`}>Asignación</a>
            <a className={planningSubtab === "bloqueos" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/reservas?tab=planning&planningSubtab=bloqueos&${planningQueryBase}`}>Bloqueos</a>
            <a className={planningSubtab === "resumen" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/reservas?tab=planning&planningSubtab=resumen&${planningQueryBase}`}>Resumen</a>
            <a className={planningSubtab === "detalle" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/reservas?tab=planning&planningSubtab=detalle&${planningQueryBase}`}>Detalle</a>
          </div>

          {planningSubtab === "principal" ? (
            <>
              <section className="card-muted stack-sm">
                <h4>Planning visual dedicado</h4>
                <p className="muted-text">Usa la vista completa para trabajar el planning con máximo espacio de pantalla.</p>
                <a
                  className="primary-btn text-center"
                  href={`/planning-completo?start=${encodeURIComponent(planningStart)}&period=${planningPeriod}&plate=${encodeURIComponent(planningPlate)}&group=${encodeURIComponent(planningGroup)}&model=${encodeURIComponent(planningModel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir planning completo
                </a>
              </section>
              {selectedPlanningItem ? (
                <details className="card-muted" open>
                  <summary>Detalle de reserva seleccionada</summary>
                  <div className="stack-sm" style={{ marginTop: "0.6rem" }}>
                    <p className="muted-text">Estado: {selectedPlanningItem.status}</p>
                    <p className="muted-text">Entrega: {selectedPlanningItem.startAt}</p>
                    <p className="muted-text">Recogida: {selectedPlanningItem.endAt}</p>
                    <p className="muted-text">Referencia: {selectedPlanningItem.label}</p>
                    <p className="muted-text">Matrícula: {selectedPlanningItem.vehiclePlate}</p>
                    {selectedPlanningItem.type === "RESERVA" ? (
                      <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(selectedPlanningItem.label)}`}>Abrir reserva</a>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          {planningSubtab === "asignacion" ? (
            <section className="card stack-md">
              <h4>Asignación manual de matrícula</h4>
              {!canWrite ? <p className="danger-text">Modo lectura: no puedes asignar.</p> : null}
              <form action={assignPlateAction} className="planning-form-grid">
                <label>
                  Reserva sin matrícula
                  <select name="reservationId" disabled={!canWrite}>
                    {unassignedReservations.length === 0 ? (
                      <option value="">Sin pendientes</option>
                    ) : (
                      unassignedReservations.map((reservation) => (
                        <option key={reservation.id} value={reservation.id}>
                          {reservation.reservationNumber} | {reservation.billedCarGroup || "N/D"} | {reservation.customerName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  Matrícula
                  <input name="assignedPlate" placeholder="0000XXX" disabled={!canWrite} />
                </label>
                <label>
                  Override por solape
                  <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </label>
                <label>
                  Motivo override solape
                  <input name="overrideReason" placeholder="Motivo si hay conflicto" disabled={!canWrite} />
                </label>
                <label>
                  Asignar grupo distinto
                  <select name="groupOverrideAccepted" defaultValue="false" disabled={!canWrite}>
                    <option value="false">No</option>
                    <option value="true">Sí, confirmar cambio</option>
                  </select>
                </label>
                <label>
                  Motivo cambio de grupo
                  <input name="groupOverrideReason" placeholder="Motivo ajuste" disabled={!canWrite} />
                </label>
                <label>
                  Ajustar precio
                  <select name="applyPriceAdjustment" defaultValue="false" disabled={!canWrite}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </label>
                <label>
                  Importe ajuste (+/-)
                  <input name="priceAdjustmentAmount" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
                </label>
                <button className="primary-btn" type="submit" disabled={!canWrite || unassignedReservations.length === 0}>Asignar matrícula</button>
              </form>
            </section>
          ) : null}

          {planningSubtab === "bloqueos" ? (
            <section className="card stack-md">
              <h4>Bloqueo manual de vehículo</h4>
              {!canWrite ? <p className="danger-text">Modo lectura: no puedes bloquear.</p> : null}
              <form action={createBlockAction} className="planning-form-grid">
                <label>
                  Matrícula
                  <input name="vehiclePlate" placeholder="0000XXX" disabled={!canWrite} />
                </label>
                <label>
                  Inicio
                  <input name="startAt" type="datetime-local" disabled={!canWrite} />
                </label>
                <label>
                  Fin
                  <input name="endAt" type="datetime-local" disabled={!canWrite} />
                </label>
                <label>
                  Motivo bloqueo
                  <input name="reason" placeholder="Taller, revisión, etc." disabled={!canWrite} />
                </label>
                <label>
                  Confirmar override por conflicto
                  <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </label>
                <label>
                  Motivo override
                  <input name="overrideReason" placeholder="Obligatorio si se solapa" disabled={!canWrite} />
                </label>
                <button className="secondary-btn" type="submit" disabled={!canWrite}>Crear bloqueo</button>
              </form>
            </section>
          ) : null}

          {planningSubtab === "resumen" ? (
            <section className="card stack-sm">
              <h4>Resumen de tramo</h4>
              {selectedPlanningItem ? (
                <div className="stack-sm">
                  <p className="muted-text">Estado: {selectedPlanningItem.status}</p>
                  <p className="muted-text">Tramo: {selectedPlanningItem.startAt} → {selectedPlanningItem.endAt}</p>
                  <p className="muted-text">Referencia: {selectedPlanningItem.label}</p>
                  <p className="muted-text">Matrícula/Fila: {selectedPlanningItem.vehiclePlate}</p>
                  {selectedPlanningItem.type === "RESERVA" ? (
                    <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(selectedPlanningItem.label)}`}>2 clicks: editar reserva</a>
                  ) : null}
                </div>
              ) : (
                <p className="muted-text">Desde principal, pulsa una celda para cargar el resumen.</p>
              )}
            </section>
          ) : null}

          {planningSubtab === "detalle" ? (
            <section className="card stack-sm">
              <h4>Detalle por grupos</h4>
              {planning.length === 0 ? (
                <p className="muted-text">Sin elementos en el periodo seleccionado.</p>
              ) : (
                <div className="stack-sm">
                  {planning.map((group) => (
                    <article key={group.groupLabel} className="planning-group-card">
                      <h5>Grupo: {group.groupLabel}</h5>
                      {group.models.map((model) => (
                        <div key={`${group.groupLabel}-${model.modelLabel}`} className="planning-model-block">
                          <h6>{model.modelLabel}</h6>
                          {model.rows.map((row) => (
                            <article key={row.vehiclePlate} className="planning-row-card">
                              <strong>{row.rowType === "HUERFANA" ? "Hueco huérfana" : row.vehiclePlate}</strong>
                              <div className="planning-item-list">
                                {row.items.map((item) => (
                                  <div key={item.id} className={item.overlap ? "planning-item overlap card-muted" : "card-muted"}>
                                    <p><span className={`status-chip status-${item.status}`}>{item.status}</span></p>
                                    <p className="muted-text">{item.startAt} → {item.endAt}</p>
                                    <p>{item.label}</p>
                                    <div className="inline-actions-cell">
                                      <a className="secondary-btn text-center" href={`/reservas?tab=planning&planningSubtab=resumen&planningSelected=${encodeURIComponent(item.id)}&${planningQueryBase}`}>Resumen</a>
                                      {item.type === "RESERVA" ? (
                                        <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(item.label)}`}>Editar reserva</a>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </section>
      ) : null}

      {tab === "informes" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Informes de reserva</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="informes" />
              <select name="reportDateField" defaultValue={reportDateField}>
                <option value="CREACION">Fecha de creación</option>
                <option value="ENTREGA">Fecha de entrega</option>
                <option value="RECOGIDA">Fecha de recogida</option>
              </select>
              <input name="reportFrom" type="date" defaultValue={reportFrom} />
              <input name="reportTo" type="date" defaultValue={reportTo} />
              <input name="reportChannel" defaultValue={reportChannel} placeholder="Canal" />
              <select name="reportStatus" defaultValue={reportStatus}>
                <option value="TODOS">Estado: todos</option>
                <option value="PETICION">Petición</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CONTRATADA">Contratada</option>
              </select>
              <input name="reportDeliveryBranch" defaultValue={reportDeliveryBranch} placeholder="Oficina entrega" />
              <input name="reportPickupBranch" defaultValue={reportPickupBranch} placeholder="Oficina recogida" />
              <input name="reportGroup" defaultValue={reportGroup} placeholder="Grupo" />
              <input name="reportCommissioner" defaultValue={reportCommissioner} placeholder="Comisionista" />
              <input name="reportCompany" defaultValue={reportCompany} placeholder="Cliente empresa" />
              <select name="reportOrderBy" defaultValue={reportOrderBy}>
                <option value="FECHA">Orden por fecha criterio</option>
                <option value="CREACION">Orden por creación</option>
                <option value="TOTAL">Orden por total</option>
              </select>
              <select name="reportOrder" defaultValue={reportOrder}>
                <option value="ASC">Ascendente</option>
                <option value="DESC">Descendente</option>
              </select>
              <button className="secondary-btn" type="submit">Validar</button>
            </form>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>F/Alta</th>
                  <th>Estado</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Tarifa</th>
                  <th>Grupo</th>
                  <th>Días</th>
                  <th>Empresa</th>
                  <th>Comisionista</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr><td colSpan={11} className="muted-text">Sin registros para filtros.</td></tr>
                ) : (
                  reportRows.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.reservationNumber}</td>
                      <td>{reservation.createdAt}</td>
                      <td>{reservationStateLabel({ contractId: reservation.contractId, reservationStatus: reservation.reservationStatus })}</td>
                      <td>{reservation.deliveryAt}</td>
                      <td>{reservation.pickupAt}</td>
                      <td>{reservation.appliedRate || "N/D"}</td>
                      <td>{reservation.billedCarGroup || "N/D"}</td>
                      <td>{reservation.billedDays}</td>
                      <td>{reservation.customerCompany || "N/D"}</td>
                      <td>{reservation.customerCommissioner || "N/D"}</td>
                      <td>{reservation.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="muted-text">Reservas: {reportRows.length} | Total reservas: {reportTotal.toFixed(2)}</p>
        </section>
      ) : null}
    </div>
  );
}
