import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  createClient,
  deactivateClient,
  deleteReservation,
  deleteClient,
  getNextClientCode,
  getClientById,
  listClientReservations,
  listClients,
  updateClient,
} from "@/lib/services/rental-service";
import { ClientForm } from "@/app/(panel)/clientes/client-form";

type Props = {
  searchParams: Promise<{ q?: string; type?: string; selectedClientId?: string; error?: string }>;
};

export default async function ClientesPage({ searchParams }: Props) {
  // Página maestra de clientes + histórico de reservas por cliente.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const q = params.q ?? "";
  const type = params.type ?? "TODOS";
  const selectedClientId = params.selectedClientId ?? "";
  const canWrite = user.role !== "LECTOR";

  const clients = await listClients(q, type);
  const nextClientCode = await getNextClientCode();
  const selectedClient = selectedClientId ? await getClientById(selectedClientId) : null;
  const reservationHistory = selectedClientId ? await listClientReservations(selectedClientId) : [];

  // Server Action para alta de cliente con validaciones por tipo.
  async function createClientAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/clientes?error=Permiso+denegado");
    }

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;

    try {
      await createClient(input, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect("/clientes");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear cliente";
      redirect(`/clientes?error=${encodeURIComponent(message)}`);
    }
  }

  async function deactivateClientAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/clientes?error=Permiso+denegado");
    }
    const clientId = String(formData.get("clientId") ?? "");
    try {
      await deactivateClient(clientId, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect(`/clientes?selectedClientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al dar de baja cliente";
      redirect(`/clientes?error=${encodeURIComponent(message)}`);
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
      redirect(`/clientes?selectedClientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar cliente";
      redirect(`/clientes?error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteClientAction(formData: FormData) {
    "use server";

    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/clientes?error=Permiso+denegado");

    const clientId = String(formData.get("clientId") ?? "");
    try {
      await deleteClient(clientId, { id: actor.id, role: actor.role });
      revalidatePath("/clientes");
      redirect("/clientes");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar cliente";
      redirect(`/clientes?error=${encodeURIComponent(message)}`);
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
      redirect(`/clientes?selectedClientId=${encodeURIComponent(clientId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar reserva";
      redirect(`/clientes?selectedClientId=${encodeURIComponent(clientId)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Clientes</h2>
        <p className="muted-text">Particular / Empresa / Comisionista con campos condicionales y direcciones por campos comunes.</p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}

      <section className="card stack-md">
        <h3>Alta cliente</h3>
        <ClientForm
          action={createClientAction}
          deactivateAction={deactivateClientAction}
          canWrite={canWrite}
          nextClientCode={nextClientCode}
          existingClients={clients.map((client) => ({
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
        <div className="table-header-row">
          <h3>Listado clientes</h3>
          <form method="GET" className="inline-search">
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
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted-text">Sin clientes.</td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.clientCode}</td>
                    <td>{client.clientType}</td>
                    <td>{[client.firstName, client.lastName].join(" ").trim() || client.companyName || "N/D"}</td>
                    <td>{client.documentType} {client.documentNumber}</td>
                    <td>{client.email || "N/D"}</td>
                    <td>{client.companyDrivers || "N/D"}</td>
                    <td>
                      <div className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/clientes?selectedClientId=${client.id}`}>
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
                            <label>Carné<input name="licenseNumber" defaultValue={client.licenseNumber} /></label>
                            <label>Idioma<input name="language" defaultValue={client.language} /></label>
                            <label>Forma pago<input name="paymentMethod" defaultValue={client.paymentMethod} /></label>
                            <label className="col-span-2">Observaciones<textarea name="notes" rows={2} defaultValue={client.notes} /></label>
                            <label className="col-span-2">Avisos<textarea name="warnings" rows={2} defaultValue={client.warnings} /></label>
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar cambios</button>
                          </form>
                          <form action={deleteClientAction} className="mini-form">
                            <input type="hidden" name="clientId" value={client.id} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>
                              Borrar cliente
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

      <section className="card stack-sm">
        <h3>Histórico de reservas por cliente</h3>
        {!selectedClient ? (
          <p className="muted-text">Selecciona un cliente para ver histórico.</p>
        ) : (
          <>
            <p className="muted-text">
              Cliente: {selectedClient.clientCode} - {[selectedClient.firstName, selectedClient.lastName].join(" ").trim() || selectedClient.companyName}
            </p>
            <div className="inline-actions-cell">
              <form action={deactivateClientAction}>
                <input type="hidden" name="clientId" value={selectedClient.id} />
                <button className="secondary-btn" type="submit" disabled={!canWrite || selectedClient.accountBlocked}>
                  {selectedClient.accountBlocked ? "Cliente dado de baja" : "Dar de baja"}
                </button>
              </form>
              <a className="secondary-btn text-center" href={`/clientes?selectedClientId=${selectedClient.id}`}>
                Ver histórico de reservas
              </a>
              <a className="secondary-btn text-center" href={`/reservas?prefillClientId=${selectedClient.id}`}>
                Reserva
              </a>
              <a className="secondary-btn text-center" href="/clientes">
                Limpiar datos
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
                  {reservationHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Sin reservas asociadas.</td>
                    </tr>
                  ) : (
                    reservationHistory.map((reservation) => (
                      <tr key={reservation.id}>
                        <td>{reservation.reservationNumber}</td>
                        <td>{reservation.deliveryAt}</td>
                        <td>{reservation.pickupAt}</td>
                        <td>{reservation.assignedPlate || "N/D"}</td>
                        <td>{reservation.totalPrice.toFixed(2)}</td>
                        <td>{reservation.contractId ? "CONTRATADA" : "PENDIENTE"}</td>
                        <td>
                          <div className="inline-actions-cell">
                            <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(reservation.reservationNumber)}`}>
                              Editar
                            </a>
                            <form action={deleteClientReservationAction}>
                              <input type="hidden" name="reservationId" value={reservation.id} />
                              <input type="hidden" name="clientId" value={selectedClient.id} />
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
    </div>
  );
}
