// Página del módulo clientes.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatDateTimeDisplay, formatMoneyDisplay } from "@/lib/formatting";
import { getActionErrorMessage } from "@/lib/action-errors";
import {
  createClient,
  deactivateClient,
  deleteReservation,
  getClientById,
  getClientHistorySummary,
  getNextClientCode,
  importClientsFromCsv,
  listClientCommissionSummary,
  listClientReservations,
  listClients,
  updateClient,
} from "@/lib/services/rental-service";
import { ClientForm } from "@/app/(panel)/clientes/client-form";

type ClientesTab = "ficha" | "listado" | "historico" | "comisiones";

type Props = {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    type?: string;
    historyClientId?: string;
    error?: string;
    ok?: string;
  }>;
};

function normalizeTab(value: string): ClientesTab {
  if (value === "listado" || value === "historico" || value === "comisiones") {
    return value;
  }
  return "ficha";
}

function clientDisplayName(input: { firstName: string; lastName: string; companyName: string; clientCode: string }) {
  return [input.firstName, input.lastName].join(" ").trim() || input.companyName || input.clientCode;
}

export default async function ClientesPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "LECTOR") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const tab = normalizeTab((params.tab ?? "ficha").toLowerCase());
  const q = params.q ?? "";
  const type = params.type ?? "TODOS";
  const historyClientId = params.historyClientId ?? "";
  const canWrite = true;

  const allClients = await listClients("", "TODOS");
  const filteredClients = await listClients(q, type);
  const nextClientCode = await getNextClientCode();
  const historyClient = historyClientId ? await getClientById(historyClientId) : null;
  const historyReservations = historyClientId ? await listClientReservations(historyClientId) : [];
  const historySummary = historyClientId ? await getClientHistorySummary(historyClientId) : null;
  const commissionSummary = await listClientCommissionSummary();

  async function createClientAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?error=Permiso+denegado");

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createClient(input, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect("/clientes?tab=ficha");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al crear cliente");
      redirect(`/clientes?tab=ficha&error=${encodeURIComponent(message)}`);
    }
  }

  async function importClientsCsvAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?tab=ficha&error=Permiso+denegado");
    const csvFile = formData.get("clientsCsvFile");
    if (!(csvFile instanceof File) || csvFile.size === 0) {
      redirect("/clientes?tab=ficha&error=Debes+adjuntar+un+CSV");
    }
    if (csvFile.size > 4 * 1024 * 1024) {
      redirect("/clientes?tab=ficha&error=CSV+demasiado+grande+(max+4MB)");
    }
    try {
      const csvRaw = Buffer.from(await csvFile.arrayBuffer()).toString("utf8");
      const result = await importClientsFromCsv(csvRaw, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect(`/clientes?tab=ficha&ok=${encodeURIComponent(`Importación OK: filas ${result.rows}, creados ${result.created}, reutilizados ${result.reused}`)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error importando clientes");
      redirect(`/clientes?tab=ficha&error=${encodeURIComponent(message)}`);
    }
  }

  async function deactivateClientAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?error=Permiso+denegado");
    const clientId = String(formData.get("clientId") ?? "");
    try {
      await deactivateClient(clientId, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect(`/clientes?tab=historico&historyClientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al dar de baja cliente");
      redirect(`/clientes?tab=historico&historyClientId=${encodeURIComponent(clientId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateClientAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?error=Permiso+denegado");
    const clientId = String(formData.get("clientId") ?? "");
    try {
      await updateClient(clientId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/clientes");
      const tabFromForm = String(formData.get("tabContext") ?? "listado");
      if (tabFromForm === "comisiones") {
        redirect("/clientes?tab=comisiones");
      }
      redirect(`/clientes?tab=listado&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al editar cliente");
      const tabFromForm = String(formData.get("tabContext") ?? "listado");
      if (tabFromForm === "comisiones") {
        redirect(`/clientes?tab=comisiones&error=${encodeURIComponent(message)}`);
      }
      redirect(`/clientes?tab=listado&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteClientReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?error=Permiso+denegado");
    const reservationId = String(formData.get("reservationId") ?? "");
    const clientId = String(formData.get("clientId") ?? "");
    try {
      await deleteReservation(reservationId, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      revalidatePath("/reservas");
      redirect(`/clientes?tab=historico&historyClientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al borrar reserva");
      redirect(`/clientes?tab=historico&historyClientId=${encodeURIComponent(clientId)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p>{params.ok}</p> : null}

      <section className="card stack-sm">
        <div className="table-header-row">
          <a className={tab === "ficha" ? "primary-btn text-center" : "secondary-btn text-center"} href="/clientes?tab=ficha">
            Ficha de cliente
          </a>
          <a className={tab === "listado" ? "primary-btn text-center" : "secondary-btn text-center"} href="/clientes?tab=listado">
            Listado de clientes
          </a>
          <a className={tab === "historico" ? "primary-btn text-center" : "secondary-btn text-center"} href="/clientes?tab=historico">
            Histórico
          </a>
          <a className={tab === "comisiones" ? "primary-btn text-center" : "secondary-btn text-center"} href="/clientes?tab=comisiones">
            Comisiones
          </a>
        </div>
      </section>

      {tab === "ficha" ? (
        <>
          <section className="card stack-md">
            <ClientForm
              action={createClientAction}
              deactivateAction={deactivateClientAction}
              canWrite={canWrite}
              nextClientCode={nextClientCode}
              existingClients={allClients.map((client) => ({
                id: client.id,
                clientCode: client.clientCode,
                clientType: client.clientType,
                firstName: client.firstName,
                lastName: client.lastName,
                companyName: client.companyName,
                documentNumber: client.documentNumber,
                licenseNumber: client.licenseNumber,
                taxId: client.taxId,
                email: client.email,
                warnings: client.warnings,
              }))}
            />
          </section>

          <section className="card stack-sm">
            <h3>Importación por archivo (CSV estándar)</h3>
            <form action={importClientsCsvAction} className="inline-search import-compact">
              <input name="clientsCsvFile" type="file" accept=".csv,text/csv" required disabled={!canWrite} />
              <button className="secondary-btn" type="submit" disabled={!canWrite}>Importar CSV</button>
            </form>
          </section>
        </>
      ) : null}

      {tab === "listado" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="listado" />
              <input name="q" defaultValue={q} placeholder="Busca por nombre, mail, doc..." />
              <select name="type" defaultValue={type}>
                <option value="TODOS">Todos</option>
                <option value="PARTICULAR">Particulares</option>
                <option value="EMPRESA">Empresas</option>
                <option value="COMISIONISTA">Comisionistas</option>
              </select>
              <button className="secondary-btn" type="submit">Buscar</button>
            </form>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Nombre/Empresa</th>
                  <th>Documento</th>
                  <th>Email</th>
                  <th>Conductores empresa</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted-text">Sin clientes.</td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.clientCode}</td>
                      <td>{client.clientType}</td>
                      <td>{clientDisplayName(client)}</td>
                      <td>{client.documentType} {client.documentNumber}</td>
                      <td>{client.email || "N/D"}</td>
                      <td>{client.companyDrivers || "N/D"}</td>
                      <td>
                        <div className="inline-actions-cell">
                          <a className="secondary-btn text-center" href={`/clientes?tab=historico&historyClientId=${client.id}`}>
                            Ver histórico
                          </a>
                          <details>
                            <summary>Editar / Borrar</summary>
                            <form action={updateClientAction} className="mini-form">
                              <input type="hidden" name="clientId" value={client.id} />
                              <label>Nombre<input name="firstName" defaultValue={client.firstName} /></label>
                              <label>Apellidos<input name="lastName" defaultValue={client.lastName} /></label>
                              <label>Empresa<input name="companyName" defaultValue={client.companyName} /></label>
                              <label>Email<input name="email" type="email" defaultValue={client.email} /></label>
                              <label>Teléfono 1<input name="phone1" defaultValue={client.phone1} /></label>
                              <label>Teléfono 2<input name="phone2" defaultValue={client.phone2} /></label>
                              <label>Documento<input name="documentType" defaultValue={client.documentType} /></label>
                              <label>Nº documento<input name="documentNumber" defaultValue={client.documentNumber} /></label>
                              <label>Permiso de conducir<input name="licenseNumber" defaultValue={client.licenseNumber} /></label>
                            <label>Idioma<input name="language" defaultValue={client.language} /></label>
                            <label>Forma pago<input name="paymentMethod" defaultValue={client.paymentMethod} /></label>
                            <label>% comisión<input name="commissionPercent" type="number" step="0.01" min="0" defaultValue={String(client.commissionPercent ?? 0)} /></label>
                            <label className="col-span-2">Observaciones<textarea name="notes" rows={2} defaultValue={client.notes} /></label>
                            <label className="col-span-2">Avisos<textarea name="warnings" rows={2} defaultValue={client.warnings} /></label>
                              <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar cambios</button>
                            </form>
                            <form action={deactivateClientAction} className="mini-form">
                              <input type="hidden" name="clientId" value={client.id} />
                              <button className="secondary-btn" type="submit" disabled={!canWrite}>
                                {client.accountBlocked ? "Cliente dado de baja" : "Dar de baja"}
                              </button>
                            </form>
                          </details>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "historico" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="historico" />
              <input name="historyClientId" defaultValue={historyClientId} placeholder="ID cliente" list="clients-history-list" />
              <datalist id="clients-history-list">
                {allClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.clientCode} | {clientDisplayName(client)}
                  </option>
                ))}
              </datalist>
              <button className="secondary-btn" type="submit">Cargar</button>
            </form>
          </div>

          {!historyClient ? (
            <p className="muted-text">Introduce un cliente para ver histórico.</p>
          ) : (
            <>
              <p className="muted-text">
                Cliente: {historyClient.clientCode} - {clientDisplayName(historyClient)}
              </p>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Total reservas</th>
                      <th>Total contratos</th>
                      <th>Contratos abiertos</th>
                      <th>Contratos cerrados</th>
                      <th>Importe reservas</th>
                      <th>Importe contratos</th>
                      <th>Importe facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{historySummary?.reservationsCount ?? 0}</td>
                      <td>{historySummary?.contractsCount ?? 0}</td>
                      <td>{historySummary?.openContractsCount ?? 0}</td>
                      <td>{historySummary?.closedContractsCount ?? 0}</td>
                      <td>{(historySummary?.reservationsTotalAmount ?? 0).toFixed(2)}</td>
                      <td>{(historySummary?.contractedTotalAmount ?? 0).toFixed(2)}</td>
                      <td>{(historySummary?.invoicedTotalAmount ?? 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="inline-actions-cell">
                <form action={deactivateClientAction}>
                  <input type="hidden" name="clientId" value={historyClient.id} />
                  <button
                    className="secondary-btn"
                    type="submit"
                    disabled={!canWrite || historyClient.accountBlocked || Boolean((historySummary?.contractsCount ?? 0) > 0)}
                  >
                    {historyClient.accountBlocked
                      ? "Cliente dado de baja"
                      : (historySummary?.contractsCount ?? 0) > 0
                        ? "No baja (tiene contratos)"
                        : "Dar de baja"}
                  </button>
                </form>
                <a className="secondary-btn text-center" href={`/reservas?prefillClientId=${historyClient.id}`}>
                  Reserva
                </a>
                <a className="secondary-btn text-center" href="/clientes?tab=historico">
                  Limpiar
                </a>
                <a className="secondary-btn text-center" href="/dashboard">
                  Salir
                </a>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nº reserva</th>
                      <th>Entrega</th>
                      <th>Recogida</th>
                      <th>Matrícula</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyReservations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="muted-text">Sin reservas asociadas.</td>
                      </tr>
                    ) : (
                      historyReservations.map((reservation) => (
                        <tr key={reservation.id}>
                          <td>{reservation.reservationNumber}</td>
                          <td>{formatDateTimeDisplay(reservation.deliveryAt)}</td>
                          <td>{formatDateTimeDisplay(reservation.pickupAt)}</td>
                          <td>{reservation.assignedPlate || "N/D"}</td>
                          <td>{formatMoneyDisplay(reservation.totalPrice)}</td>
                          <td>{reservation.contractId ? "CONTRATADA" : "PENDIENTE"}</td>
                          <td>
                            <div className="inline-actions-cell">
                              <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(reservation.reservationNumber)}`}>
                                Editar
                              </a>
                              <form action={deleteClientReservationAction}>
                                <input type="hidden" name="reservationId" value={reservation.id} />
                                <input type="hidden" name="clientId" value={historyClient.id} />
                                <button className="secondary-btn" type="submit" disabled={!canWrite || Boolean(reservation.contractId)}>
                                  {reservation.contractId ? "No borrable" : "Borrar"}
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {tab === "comisiones" ? (
        <section className="card stack-sm">
          <details>
            <summary>Configurar</summary>
            <div className="table-wrap" style={{ marginTop: "0.6rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Nombre</th>
                    <th>% fijo</th>
                  </tr>
                </thead>
                <tbody>
                  {allClients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted-text">Sin clientes.</td>
                    </tr>
                  ) : (
                    allClients.map((client) => (
                      <tr key={client.id}>
                        <td>{client.clientCode}</td>
                        <td>{client.clientType}</td>
                        <td>{clientDisplayName(client)}</td>
                        <td>
                          <form action={updateClientAction} className="inline-search">
                            <input type="hidden" name="clientId" value={client.id} />
                            <input type="hidden" name="tabContext" value="comisiones" />
                            <input name="commissionPercent" type="number" step="0.01" min="0" defaultValue={String(client.commissionPercent ?? 0)} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </details>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Sujeto</th>
                  <th>% fijo</th>
                  <th>Reservas</th>
                  <th>Contratadas</th>
                  <th>Importe reservas</th>
                  <th>Importe contratadas</th>
                  <th>Comisión reservas</th>
                  <th>Comisión contratadas</th>
                </tr>
              </thead>
              <tbody>
                {commissionSummary.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted-text">Sin datos de comisiones.</td>
                  </tr>
                ) : (
                  commissionSummary.map((row) => (
                    <tr key={`${row.subjectType}-${row.clientId ?? row.subjectName}`}>
                      <td>{row.subjectType}</td>
                      <td>{row.subjectName}</td>
                      <td>{row.commissionPercent.toFixed(2)}%</td>
                      <td>{row.reservationsCount}</td>
                      <td>{row.contractedCount}</td>
                      <td>{row.reservationsAmount.toFixed(2)}</td>
                      <td>{row.contractedAmount.toFixed(2)}</td>
                      <td>{row.commissionReservationsAmount.toFixed(2)}</td>
                      <td>{row.commissionContractedAmount.toFixed(2)}</td>
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
