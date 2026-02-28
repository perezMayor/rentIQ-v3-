import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  createDailyOperationalExpense,
  deleteInternalExpense,
  listActiveRentalPlatesByDate,
  listDailyOperationalExpenses,
  updateInternalExpense,
  validateDailyOperationalExpenses,
} from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; plate?: string; worker?: string; expenseDate?: string; error?: string }>;
};

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default async function GastosPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const range = getDefaultRange();
  const from = params.from ?? range.from;
  const to = params.to ?? range.to;
  const plate = params.plate ?? "";
  const worker = params.worker ?? "";
  const expenseDate = params.expenseDate ?? new Date().toISOString().slice(0, 10);
  const canWrite = user.role !== "LECTOR";

  const activePlates = await listActiveRentalPlatesByDate(expenseDate);
  const dailyExpenses = await listDailyOperationalExpenses({ from, to, plate, worker });
  const validation = await validateDailyOperationalExpenses({ from, to });

  async function createExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/gastos?error=Permiso+denegado");
    }

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createDailyOperationalExpense(input, { id: actor.id, role: actor.role });
      revalidatePath("/gastos");
      revalidatePath("/vehiculos");
      revalidatePath("/facturacion");
      redirect(
        `/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando gasto diario";
      redirect(
        `/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function updateExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gastos?error=Permiso+denegado");
    const expenseId = String(formData.get("expenseId") ?? "");
    try {
      await updateInternalExpense(expenseId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/gastos");
      revalidatePath("/facturacion");
      revalidatePath("/vehiculos");
      redirect(`/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar gasto";
      redirect(`/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gastos?error=Permiso+denegado");
    const expenseId = String(formData.get("expenseId") ?? "");
    try {
      await deleteInternalExpense(expenseId, { id: actor.id, role: actor.role });
      revalidatePath("/gastos");
      revalidatePath("/facturacion");
      revalidatePath("/vehiculos");
      redirect(`/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar gasto";
      redirect(`/gastos?from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Gastos diarios</h2>
        <p className="muted-text">
          Registro interno por empleado y día. No impacta facturación ni contrato; sí se suma al coste por vehículo.
        </p>
        <p className="muted-text">
          Regla activa: solo se admiten matrículas con alquiler activo en la fecha indicada.
        </p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {!canWrite ? <p className="danger-text">Modo lectura: no puedes registrar gastos.</p> : null}

      <section className="card stack-sm">
        <h3>Nuevo gasto diario</h3>
        <form method="GET" className="inline-search">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="plate" value={plate} />
          <input type="hidden" name="worker" value={worker} />
          <label>
            Fecha referencia matrículas
            <input name="expenseDate" type="date" defaultValue={expenseDate} />
          </label>
          <button className="secondary-btn" type="submit">Actualizar matrículas válidas</button>
        </form>
        <form action={createExpenseAction} className="form-grid">
          <label>
            Fecha *
            <input name="expenseDate" type="date" required defaultValue={expenseDate} disabled={!canWrite} />
          </label>
          <label>
            Empleado *
            <input name="workerName" required placeholder="Nombre del trabajador" defaultValue={user.name} disabled={!canWrite} />
          </label>
          <label>
            Categoría *
            <select name="category" defaultValue="GASOLINA" disabled={!canWrite}>
              <option value="PEAJE">Peaje</option>
              <option value="GASOLINA">Gasolina</option>
              <option value="COMIDA">Comida</option>
              <option value="PARKING">Parking</option>
              <option value="LAVADO">Lavado</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label>
            Importe total *
            <input name="amount" type="number" step="0.01" min="0.01" required disabled={!canWrite} />
          </label>
          <label className="col-span-2">
            Matrículas *
            <textarea
              name="vehiclePlates"
              rows={3}
              required
              placeholder="Separar por coma, espacio o salto de línea. Ejemplo: 1234ABC, 5678DEF"
              disabled={!canWrite}
            />
          </label>
          <label className="col-span-2">
            Nota
            <input name="note" placeholder="Opcional" disabled={!canWrite} />
          </label>
          <div className="col-span-2">
            <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar gasto diario</button>
          </div>
        </form>
        <details>
          <summary>Ver matrículas con alquiler activo ({expenseDate})</summary>
          <p className="muted-text">
            {activePlates.length === 0
              ? "Sin matrículas con alquiler activo ese día."
              : activePlates.map((item) => `${item.plate} (${item.groupLabel} - ${item.modelLabel})`).join(", ")}
          </p>
        </details>
      </section>

      <section className="card stack-sm">
        <h3>Validación operativa (rango filtrado)</h3>
        <p className="muted-text">Estado: {validation.ok ? "OK" : "CON INCIDENCIAS"}</p>
        <p className="muted-text">Registros diarios: {validation.totalRows}</p>
        <p className="muted-text">Sin batch: {validation.noBatch}</p>
        <p className="muted-text">Sin empleado: {validation.noWorker}</p>
        <p className="muted-text">Matrícula fuera de flota: {validation.notInFleet}</p>
        <p className="muted-text">Sin alquiler activo ese día: {validation.withoutActiveRental}</p>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Histórico de gastos diarios</h3>
          <form method="GET" className="inline-search">
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <input name="plate" defaultValue={plate} placeholder="Matrícula" />
            <input name="worker" defaultValue={worker} placeholder="Empleado" />
            <input type="hidden" name="expenseDate" value={expenseDate} />
            <button className="secondary-btn" type="submit">Filtrar</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Matrícula</th>
                <th>Categoría</th>
                <th>Importe asignado</th>
                <th>Batch</th>
                <th>Empleado</th>
                <th>Detalle</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {dailyExpenses.rows.length === 0 ? (
                <tr><td colSpan={8} className="muted-text">Sin gastos en ese rango.</td></tr>
              ) : (
                dailyExpenses.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.expenseDate}</td>
                    <td>{row.vehiclePlate}</td>
                    <td>{row.category}</td>
                    <td>{row.amount.toFixed(2)}</td>
                    <td>{row.batchId || "N/D"}</td>
                    <td>{row.workerName || "N/D"}</td>
                    <td>{row.note || "N/D"}</td>
                    <td>
                      <details>
                        <summary>Editar / Borrar</summary>
                        <form action={updateExpenseAction} className="mini-form">
                          <input type="hidden" name="expenseId" value={row.id} />
                          <label>Fecha<input name="expenseDate" type="date" defaultValue={row.expenseDate} /></label>
                          <label>Matrícula<input name="vehiclePlate" defaultValue={row.vehiclePlate} /></label>
                          <label>Categoría<select name="category" defaultValue={row.category}><option value="PEAJE">Peaje</option><option value="GASOLINA">Gasolina</option><option value="COMIDA">Comida</option><option value="PARKING">Parking</option><option value="LAVADO">Lavado</option><option value="OTRO">Otro</option></select></label>
                          <label>Importe<input name="amount" type="number" step="0.01" defaultValue={row.amount.toFixed(2)} /></label>
                          <label>Empleado<input name="workerName" defaultValue={row.workerName} /></label>
                          <label>Nota<input name="note" defaultValue={row.note} /></label>
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                        </form>
                        <form action={deleteExpenseAction} className="mini-form">
                          <input type="hidden" name="expenseId" value={row.id} />
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar gasto</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted-text">Total asignado (rango): {dailyExpenses.totalAmount.toFixed(2)}</p>
      </section>
    </div>
  );
}
