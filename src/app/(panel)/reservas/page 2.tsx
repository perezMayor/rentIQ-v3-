import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  createReservation,
  deleteReservation,
  convertReservationToContract,
  getReservationForecast,
  getSalesChannelStats,
  addSalesChannel,
  listClients,
  listFleetVehicles,
  listSalesChannels,
  listReservationConfirmationLogs,
  listTariffPlans,
  listVehicleExtras,
  listReservationAudit,
  listReservations,
  sendReservationConfirmation,
  updateReservation,
} from "@/lib/services/rental-service";
import { ReservationForm } from "@/app/(panel)/reservas/reservation-form";

type Props = {
  searchParams: Promise<{
    q?: string;
    error?: string;
    auditReservationId?: string;
    forecastFrom?: string;
    forecastTo?: string;
    logFrom?: string;
    logTo?: string;
    statsFrom?: string;
    statsTo?: string;
    prefillClientId?: string;
  }>;
};

export default async function ReservasPage({ searchParams }: Props) {
  // Página de reservas: alta + listado + conversión a contrato.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const q = params.q ?? "";
  const auditReservationId = params.auditReservationId ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const forecastFrom = params.forecastFrom ?? today;
  const forecastTo = params.forecastTo ?? today;
  const logFrom = params.logFrom ?? today;
  const logTo = params.logTo ?? today;
  const statsFrom = params.statsFrom ?? today;
  const statsTo = params.statsTo ?? today;
  const prefillClientId = params.prefillClientId ?? "";
  const items = await listReservations(q);
  const tariffPlans = await listTariffPlans("");
  const clients = await listClients("", "TODOS");
  const prefillClient = prefillClientId ? clients.find((client) => client.id === prefillClientId) ?? null : null;
  const fleet = await listFleetVehicles();
  const vehicleExtras = await listVehicleExtras();
  const salesChannels = await listSalesChannels();
  const salesChannelStats = await getSalesChannelStats({ from: statsFrom, to: statsTo });
  const forecast = await getReservationForecast({ from: forecastFrom, to: forecastTo });
  const confirmationLogs = await listReservationConfirmationLogs({ from: logFrom, to: logTo });
  const auditItems = auditReservationId ? await listReservationAudit(auditReservationId) : [];
  const selectedReservation = auditReservationId ? items.find((item) => item.id === auditReservationId) ?? null : null;
  const canWrite = user.role !== "LECTOR";

  // Server Action para crear reserva desde formulario.
  async function createReservationAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }

    if (actor.role === "LECTOR") {
      redirect("/reservas?error=Permiso+denegado");
    }

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;

    try {
      await createReservation(input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect("/reservas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear reserva";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  // Server Action para convertir una reserva en contrato.
  async function contratarAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }

    if (actor.role === "LECTOR") {
      redirect("/reservas?error=Permiso+denegado");
    }

    const reservationId = String(formData.get("reservationId") ?? "");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;

    try {
      await convertReservationToContract(reservationId, { id: actor.id, role: actor.role }, input);
      revalidatePath("/reservas");
      revalidatePath("/contratos");
      redirect("/contratos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al contratar";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  async function sendConfirmationAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/reservas?error=Permiso+denegado");
    }

    const reservationId = String(formData.get("reservationId") ?? "");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await sendReservationConfirmation(reservationId, input, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect(`/reservas?q=${encodeURIComponent(q)}&logFrom=${logFrom}&logTo=${logTo}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al enviar confirmacion";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  async function createSalesChannelAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/reservas?error=Permiso+denegado");
    }

    const value = String(formData.get("salesChannelName") ?? "");
    try {
      await addSalesChannel(value, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect(`/reservas?q=${encodeURIComponent(q)}&statsFrom=${statsFrom}&statsTo=${statsTo}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear canal";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  async function updateReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?error=Permiso+denegado");
    const reservationId = String(formData.get("reservationId") ?? "");
    try {
      await updateReservation(reservationId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/reservas");
      redirect(`/reservas?q=${encodeURIComponent(q)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar reserva";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/reservas?error=Permiso+denegado");
    const reservationId = String(formData.get("reservationId") ?? "");
    try {
      await deleteReservation(reservationId, { id: actor.id, role: actor.role });
      revalidatePath("/reservas");
      redirect(`/reservas?q=${encodeURIComponent(q)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar reserva";
      redirect(`/reservas?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Reservas</h2>
        <p className="muted-text">
          Alta por grupo con desglose lateral de precios, total calculado y contratación directa.
        </p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}

      <section className="card stack-md">
        <h3>Nueva reserva</h3>
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

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Listado de reservas</h3>
          <form method="GET" className="inline-search">
            <input name="q" defaultValue={q} placeholder="nº reserva, cliente, matrícula, fecha..." />
            <button className="secondary-btn" type="submit">
              Buscar
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Serie/Doc</th>
                <th>Cliente</th>
                <th>Grupo</th>
                <th>Matrícula</th>
                <th>Entrega</th>
                <th>Recogida</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="muted-text">
                    Sin reservas.
                  </td>
                </tr>
              ) : (
                items.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>{reservation.reservationNumber}</td>
                    <td>{reservation.seriesCode} / {reservation.docType}</td>
                    <td>{reservation.customerName}</td>
                    <td>{reservation.billedCarGroup || "N/D"}</td>
                    <td>{reservation.assignedPlate || "N/D"}</td>
                    <td>{reservation.deliveryAt || "N/D"}</td>
                    <td>{reservation.pickupAt || "N/D"}</td>
                    <td>{reservation.totalPrice.toFixed(2)}</td>
                    <td>{reservation.contractId ? "CONTRATADA" : reservation.reservationStatus}</td>
                    <td className="inline-actions-cell">
                      {reservation.contractId ? <span className="muted-text">Ya contratada</span> : null}
                      {!reservation.contractId ? (
                        <form action={contratarAction} className="mini-form">
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                            <option value="false">Sin override</option>
                            <option value="true">Confirmar override</option>
                          </select>
                          <input name="overrideReason" placeholder="Motivo override (si hay conflicto)" disabled={!canWrite} />
                          <button className="primary-btn" type="submit" disabled={!canWrite}>
                            Convertir a contrato
                          </button>
                        </form>
                      ) : null}
                      <a
                        className="secondary-btn text-center"
                        href={`/reservas?q=${encodeURIComponent(q)}&auditReservationId=${reservation.id}`}
                      >
                        Auditoría
                      </a>
                      <form action={sendConfirmationAction}>
                        <input type="hidden" name="reservationId" value={reservation.id} />
                        <button className="secondary-btn" type="submit" disabled={!canWrite}>
                          Enviar confirmación
                        </button>
                      </form>
                      <details>
                        <summary>Editar / Borrar</summary>
                        <form action={updateReservationAction} className="mini-form">
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <label>Cliente<input name="customerName" defaultValue={reservation.customerName} /></label>
                          <label>Entrega<input name="deliveryAt" type="datetime-local" defaultValue={reservation.deliveryAt.slice(0, 16)} /></label>
                          <label>Recogida<input name="pickupAt" type="datetime-local" defaultValue={reservation.pickupAt.slice(0, 16)} /></label>
                          <label>Grupo<input name="billedCarGroup" defaultValue={reservation.billedCarGroup} /></label>
                          <label>Matrícula<input name="assignedPlate" defaultValue={reservation.assignedPlate} /></label>
                          <label>Total<input name="totalPrice" type="number" step="0.01" defaultValue={reservation.totalPrice.toFixed(2)} /></label>
                          <label>
                            Estado
                            <select name="reservationStatus" defaultValue={reservation.reservationStatus}>
                              <option value="CONFIRMADA">Confirmada</option>
                              <option value="PETICION">Petición</option>
                            </select>
                          </label>
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar cambios</button>
                        </form>
                        <form action={deleteReservationAction} className="mini-form">
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button className="secondary-btn" type="submit" disabled={!canWrite || Boolean(reservation.contractId)}>
                            {reservation.contractId ? "No borrable (contratada)" : "Borrar reserva"}
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Canales de venta</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="q" value={q} />
            <input name="statsFrom" type="date" defaultValue={statsFrom} />
            <input name="statsTo" type="date" defaultValue={statsTo} />
            <button className="secondary-btn" type="submit">Ver estadísticas</button>
          </form>
        </div>
        <form action={createSalesChannelAction} className="mini-form">
          <input name="salesChannelName" placeholder="Nuevo canal (agencia, web, directo...)" disabled={!canWrite} />
          <button className="secondary-btn" type="submit" disabled={!canWrite}>Añadir canal</button>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Reservas</th>
              </tr>
            </thead>
            <tbody>
              {salesChannelStats.length === 0 ? (
                <tr>
                  <td colSpan={2} className="muted-text">Sin reservas en ese rango.</td>
                </tr>
              ) : (
                salesChannelStats.map((item) => (
                  <tr key={item.channel}>
                    <td>{item.channel}</td>
                    <td>{item.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Log de confirmaciones</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="q" value={q} />
            <input name="logFrom" type="date" defaultValue={logFrom} />
            <input name="logTo" type="date" defaultValue={logTo} />
            <button className="secondary-btn" type="submit">Filtrar</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reserva</th>
                <th>Cliente</th>
                <th>Fecha envío</th>
                <th>Destino</th>
                <th>Estado</th>
                <th>Reenviar</th>
                <th>Descargar</th>
              </tr>
            </thead>
            <tbody>
              {confirmationLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted-text">Sin envíos en ese rango.</td>
                </tr>
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
                        <button className="secondary-btn" type="submit" disabled={!canWrite}>
                          Reenviar
                        </button>
                      </form>
                    </td>
                    <td>
                      <a
                        className="secondary-btn text-center"
                        href={`/api/reservas/${log.reservationId}/confirmacion/download`}
                      >
                        Descargar
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Previsión de coches por grupo</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="auditReservationId" value={auditReservationId} />
            <input name="forecastFrom" type="date" defaultValue={forecastFrom} />
            <input name="forecastTo" type="date" defaultValue={forecastTo} />
            <button className="secondary-btn" type="submit">Calcular</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Necesarios</th>
                <th>Disponibles</th>
                <th>Déficit</th>
              </tr>
            </thead>
            <tbody>
              {forecast.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted-text">Sin datos para el rango.</td>
                </tr>
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

      {auditReservationId ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Auditoría de reserva</h3>
            <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(q)}`}>
              Cerrar auditoría
            </a>
          </div>
          <p className="muted-text">
            Reserva: {selectedReservation?.reservationNumber || "N/D"} | Cliente:{" "}
            {selectedReservation?.customerName || "N/D"}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted-text">
                      Sin eventos para esta reserva.
                    </td>
                  </tr>
                ) : (
                  auditItems.map((event, index) => (
                    <tr key={`${event.timestamp}-${index}`}>
                      <td>{event.timestamp}</td>
                      <td>{event.action}</td>
                      <td>{event.actorId}</td>
                      <td>{event.actorRole}</td>
                      <td>{event.entity}</td>
                      <td>
                        <code>{JSON.stringify(event.details ?? {})}</code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
