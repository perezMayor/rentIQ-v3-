import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { deleteReservation, listPickups } from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
};

function defaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default async function RecogidasPage({ searchParams }: Props) {
  // Listado operativo de recogidas en rango con exportación PDF.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const canWrite = user.role !== "LECTOR";
  const range = defaultRange();
  const from = params.from ?? range.from;
  const to = params.to ?? range.to;
  const branch = params.branch ?? "";

  const pickups = await listPickups({ from: `${from}T00:00:00`, to: `${to}T23:59:59`, branch });

  async function deleteReservationAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect(`/recogidas?from=${from}&to=${to}&branch=${encodeURIComponent(branch)}`);
    const reservationId = String(formData.get("reservationId") ?? "");
    try {
      await deleteReservation(reservationId, { id: actor.id, role: actor.role });
      revalidatePath("/recogidas");
      revalidatePath("/reservas");
      redirect(`/recogidas?from=${from}&to=${to}&branch=${encodeURIComponent(branch)}`);
    } catch {
      redirect(`/recogidas?from=${from}&to=${to}&branch=${encodeURIComponent(branch)}`);
    }
  }

  return (
    <div className="stack-lg">
      <section className="card stack-sm">
        <form method="GET" className="inline-search">
          <input name="from" type="date" defaultValue={from} />
          <input name="to" type="date" defaultValue={to} />
          <input name="branch" defaultValue={branch} placeholder="Sucursal entrega" />
          <button className="secondary-btn" type="submit">Filtrar</button>
          <a
            className="secondary-btn text-center"
            href={`/api/reporting/recogidas/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&branch=${encodeURIComponent(branch)}`}
          >
            Exportar PDF
          </a>
        </form>
      </section>

      <section className="card stack-sm">
        <h3>Tipo 1: con contrato generado</h3>
        <PickupTable rows={pickups.withContract} canWrite={canWrite} onDelete={deleteReservationAction} />
      </section>

      <section className="card stack-sm">
        <h3>Tipo 2: sin contrato o sin matrícula</h3>
        <PickupTable rows={pickups.withoutContract} canWrite={canWrite} onDelete={deleteReservationAction} />
      </section>
    </div>
  );
}

function PickupTable({
  rows,
  canWrite,
  onDelete,
}: {
  rows: Awaited<ReturnType<typeof listPickups>>["withContract"];
  canWrite: boolean;
  onDelete: (formData: FormData) => void;
}) {
  // Tabla reutilizable para los dos grupos: con contrato / sin contrato.
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Nº reserva</th>
            <th>Contrato</th>
            <th>Lugar</th>
            <th>Cliente</th>
            <th>Matrícula</th>
            <th>Fecha/hora</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="muted-text">Sin registros.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.reservationId}-${row.datetime}`}>
                <td>{row.reservationNumber}</td>
                <td>{row.contractNumber || "N/D"}</td>
                <td>{row.place || "N/D"}</td>
                <td>{row.customerName}</td>
                <td>{row.vehiclePlate || "N/D"}</td>
                <td>{row.datetime || "N/D"}</td>
                <td>
                  <div className="inline-actions-cell">
                    <a className="secondary-btn text-center" href={`/reservas?q=${encodeURIComponent(row.reservationNumber)}`}>
                      Editar
                    </a>
                    <form action={onDelete}>
                      <input type="hidden" name="reservationId" value={row.reservationId} />
                      <button className="secondary-btn" type="submit" disabled={!canWrite || row.hasContract}>
                        {row.hasContract ? "No borrable" : "Borrar"}
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
  );
}
