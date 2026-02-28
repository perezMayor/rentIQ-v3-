import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  changeInvoiceDate,
  deleteInvoice,
  listContractClosureReconciliation,
  listExpenseJournal,
  listInvoiceJournal,
  listInvoiceSendLogs,
  renameInvoice,
} from "@/lib/services/rental-service";
import { sendInvoiceUsingTemplate } from "@/lib/services/invoice-mail-service";

type Props = {
  searchParams: Promise<{ q?: string; from?: string; to?: string; plate?: string; error?: string }>;
};

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default async function FacturacionPage({ searchParams }: Props) {
  // Página de diario de facturas + operaciones de mantenimiento y envío.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const q = params.q ?? "";
  const range = getDefaultRange();
  const from = params.from ?? range.from;
  const to = params.to ?? range.to;
  const plate = params.plate ?? "";
  const canWrite = user.role !== "LECTOR";

  const invoices = await listInvoiceJournal({ q, from, to });
  const sendLogs = await listInvoiceSendLogs({ from: `${from}T00:00:00`, to: `${to}T23:59:59` });
  const expenseJournal = await listExpenseJournal({ from, to, plate });
  const closures = await listContractClosureReconciliation({ from, to });
  const kpiFacturado = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const kpiEnviadas = sendLogs.filter((log) => log.status === "ENVIADA").length;
  const kpiErroresEnvio = sendLogs.filter((log) => log.status === "ERROR").length;
  const kpiCajaTotal = closures.reduce((sum, row) => sum + row.cashAmount, 0);
  const kpiFacturaTotal = closures.reduce((sum, row) => sum + row.invoiceTotal, 0);
  const kpiDiferenciaCajaFactura = kpiCajaTotal - kpiFacturaTotal;

  // Server Action: renombrado funcional de factura.
  async function renameAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/facturacion?error=Permiso+denegado");
    }
    try {
      await renameInvoice(String(formData.get("invoiceId") ?? ""), String(formData.get("invoiceName") ?? ""), {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/facturacion");
      redirect("/facturacion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error renombrando factura";
      redirect(`/facturacion?error=${encodeURIComponent(message)}`);
    }
  }

  // Server Action: ajuste de fecha de emisión.
  async function changeDateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/facturacion?error=Permiso+denegado");
    }
    const date = String(formData.get("issuedAt") ?? "");
    if (!date) {
      redirect("/facturacion?error=Fecha+obligatoria");
    }
    try {
      await changeInvoiceDate(String(formData.get("invoiceId") ?? ""), `${date}T00:00:00`, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/facturacion");
      redirect("/facturacion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error cambiando fecha";
      redirect(`/facturacion?error=${encodeURIComponent(message)}`);
    }
  }

  // Server Action: envío por email con plantilla + adjunto PDF.
  async function sendAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/facturacion?error=Permiso+denegado");
    }
    try {
      await sendInvoiceUsingTemplate({
        invoiceId: String(formData.get("invoiceId") ?? ""),
        toEmail: String(formData.get("toEmail") ?? ""),
        actor: { id: actor.id, role: actor.role },
      });
      revalidatePath("/facturacion");
      redirect("/facturacion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error enviando factura";
      redirect(`/facturacion?error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteInvoiceAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?error=Permiso+denegado");
    const invoiceId = String(formData.get("invoiceId") ?? "");
    try {
      await deleteInvoice(invoiceId, { id: actor.id, role: actor.role });
      revalidatePath("/facturacion");
      revalidatePath("/contratos");
      redirect("/facturacion");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando factura";
      redirect(`/facturacion?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Facturación</h2>
        <p className="muted-text">Diario de facturas con acciones y log de envíos.</p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {!canWrite ? <p className="danger-text">Modo lectura: solo visualización.</p> : null}

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Resumen KPI ({from} a {to})</h3>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Facturado</th>
                <th>Envíos OK</th>
                <th>Errores envío</th>
                <th>Caja conciliada</th>
                <th>Factura conciliada</th>
                <th>Diferencia caja-factura</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{kpiFacturado.toFixed(2)}</td>
                <td>{kpiEnviadas}</td>
                <td>{kpiErroresEnvio}</td>
                <td>{kpiCajaTotal.toFixed(2)}</td>
                <td>{kpiFacturaTotal.toFixed(2)}</td>
                <td>{kpiDiferenciaCajaFactura.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Diario de facturas</h3>
          <form method="GET" className="inline-search">
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <input name="q" defaultValue={q} placeholder="nº factura, contrato, fecha..." />
            <button className="secondary-btn" type="submit">Buscar</button>
            <a
              className="secondary-btn text-center"
              href={`/api/reporting/facturas/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}`}
            >
              Exportar CSV
            </a>
          </form>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Nombre</th>
                <th>Contrato</th>
                <th>Fecha</th>
                <th>Desglose + IVA</th>
                <th>Total</th>
                <th>Último envío</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={8} className="muted-text">Sin facturas.</td></tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.invoiceName}</td>
                    <td>{invoice.contractId}</td>
                    <td>{invoice.issuedAt.slice(0, 10)}</td>
                    <td>
                      Base {invoice.baseAmount.toFixed(2)} + Extras {invoice.extrasAmount.toFixed(2)} + Seguro {invoice.insuranceAmount.toFixed(2)} + Penal {invoice.penaltiesAmount.toFixed(2)} + IVA {invoice.ivaAmount.toFixed(2)} ({invoice.ivaPercent.toFixed(2)}%)
                    </td>
                    <td>{invoice.totalAmount.toFixed(2)}</td>
                    <td>{invoice.sentLog.length > 0 ? `${invoice.sentLog[invoice.sentLog.length - 1].status} | ${invoice.sentLog[invoice.sentLog.length - 1].sentAt}` : "Sin envíos"}</td>
                    <td>
                      <details>
                        <summary>Acciones</summary>
                        <div className="stack-sm" style={{ marginTop: "0.5rem" }}>
                          <a className="secondary-btn text-center" href={`/api/facturas/${invoice.id}/pdf`}>
                            Ver
                          </a>
                          <a className="secondary-btn text-center" href={`/api/facturas/${invoice.id}/download`}>
                            Descargar
                          </a>
                          <a className="secondary-btn text-center" href={`/contratos?q=${invoice.contractId}`}>
                            Ver contrato
                          </a>
                          <form action={renameAction} className="inline-search">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <input name="invoiceName" defaultValue={invoice.invoiceName} disabled={!canWrite} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Cambiar nombre</button>
                          </form>
                          <form action={changeDateAction} className="inline-search">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <input name="issuedAt" type="date" defaultValue={invoice.issuedAt.slice(0, 10)} disabled={!canWrite} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Cambiar fecha</button>
                          </form>
                          <form action={sendAction} className="inline-search">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <input name="toEmail" placeholder="cliente@dominio.com" disabled={!canWrite} />
                            <button className="primary-btn" type="submit" disabled={!canWrite}>Enviar mail</button>
                          </form>
                          <form action={deleteInvoiceAction} className="inline-search">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar factura</button>
                          </form>
                        </div>
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
          <h3>Diario contable (solo gastos internos)</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="q" value={q} />
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <input name="plate" defaultValue={plate} placeholder="Matrícula" />
            <button className="secondary-btn" type="submit">Filtrar</button>
          </form>
        </div>
        <p className="muted-text">Importes internos de peaje/gasolina/comida/parking/lavado/otro. No se facturan al cliente.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Matrícula</th>
                <th>Categoría</th>
                <th>Importe</th>
                <th>Origen</th>
                <th>Contrato</th>
                <th>Batch</th>
                <th>Empleado</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {expenseJournal.rows.length === 0 ? (
                <tr><td colSpan={9} className="muted-text">Sin gastos en rango.</td></tr>
              ) : (
                expenseJournal.rows.map((row, idx) => (
                  <tr key={`${row.contractId}-${row.expenseDate}-${idx}`}>
                    <td>{row.expenseDate}</td>
                    <td>{row.vehiclePlate}</td>
                    <td>{row.category}</td>
                    <td>{row.amount.toFixed(2)}</td>
                    <td>{row.sourceType}</td>
                    <td>{row.contractId}</td>
                    <td>{row.batchId || "N/D"}</td>
                    <td>{row.workerName || "N/D"}</td>
                    <td>{row.note || "N/D"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted-text">Total gastos internos: {expenseJournal.totalExpenses.toFixed(2)}</p>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Cierre de contratos y conciliación</h3>
          <a
            className="secondary-btn text-center"
            href={`/api/reporting/facturas/conciliacion/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
          >
            Exportar conciliación CSV
          </a>
        </div>
        <p className="muted-text">La caja se asocia al cierre para conciliación. No se considera gasto.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Fecha cierre</th>
                <th>Caja</th>
                <th>Método</th>
                <th>Factura</th>
                <th>Total factura</th>
              </tr>
            </thead>
            <tbody>
              {closures.length === 0 ? (
                <tr><td colSpan={6} className="muted-text">Sin cierres en rango.</td></tr>
              ) : (
                closures.map((row) => (
                  <tr key={row.contractId}>
                    <td>{row.contractNumber}</td>
                    <td>{row.closedAt}</td>
                    <td>{row.cashAmount.toFixed(2)}</td>
                    <td>{row.cashMethod}</td>
                    <td>{row.invoiceNumber}</td>
                    <td>{row.invoiceTotal.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Logs de facturas enviadas</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="plate" value={plate} />
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <button className="secondary-btn" type="submit">Filtrar</button>
          </form>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Nombre</th>
                <th>Fecha envío</th>
                <th>Destinatario</th>
                <th>Usuario</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sendLogs.length === 0 ? (
                <tr><td colSpan={6} className="muted-text">Sin envíos en rango.</td></tr>
              ) : (
                sendLogs.map((log, idx) => (
                  <tr key={`${log.invoiceId}-${idx}`}>
                    <td>{log.invoiceNumber}</td>
                    <td>{log.invoiceName}</td>
                    <td>{log.sentAt}</td>
                    <td>{log.to}</td>
                    <td>{log.sentBy}</td>
                    <td>{log.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
