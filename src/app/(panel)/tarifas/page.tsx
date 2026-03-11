// Página del módulo tarifas.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appendAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { getActionErrorMessage } from "@/lib/action-errors";
import {
  createTariffPlan,
  deleteTariffBracket,
  deleteTariffPlan,
  getCompanySettings,
  importTariffCatalogFromCsv,
  listVehicleCategories,
  listTariffCatalog,
  listTariffPlans,
  updateCompanySettings,
  updateTariffPlan,
  upsertTariffBracket,
  upsertTariffPrice,
} from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{ q?: string; tariffPlanId?: string; error?: string; ok?: string }>;
};

export default async function TarifasPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "LECTOR") {
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "RBAC_DENIED",
      actorId: user.id,
      actorRole: user.role,
      entity: "module",
      entityId: "tarifas",
    });
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = params.q ?? "";
  const plans = await listTariffPlans(q);
  const settings = await getCompanySettings();
  const vehicleCategories = await listVehicleCategories();
  const tariffPlanId = params.tariffPlanId ?? plans[0]?.id ?? "";
  const catalog = tariffPlanId ? await listTariffCatalog(tariffPlanId) : { plan: null, brackets: [], groups: [], prices: [] };

  async function createPlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planCode = String(input.code ?? "").trim().toUpperCase();
    try {
      await createTariffPlan(input, { id: actor.id, role: actor.role });
      const initialGroupCode = String(input.initialGroupCode ?? "").trim().toUpperCase();
      const initialLabel = String(input.initialBracketLabel ?? "").trim();
      const initialFromDay = String(input.initialFromDay ?? "").trim();
      const initialToDay = String(input.initialToDay ?? "").trim();
      const initialPrice = String(input.initialPrice ?? "").trim();
      const initialMaxKmPerDay = String(input.initialMaxKmPerDay ?? "").trim();
      const hasInitialPricing = [initialGroupCode, initialLabel, initialPrice].some((value) => value.length > 0);
      if (hasInitialPricing) {
        if (!initialGroupCode || !initialLabel || !initialPrice) {
          throw new Error("Para cargar importes al crear la tarifa, indica grupo, tramo e importe");
        }
        const allPlans = await listTariffPlans(planCode);
        const createdPlan = allPlans.find((plan) => plan.code === planCode);
        if (!createdPlan) {
          throw new Error("No se pudo recuperar la tarifa recién creada");
        }
        await upsertTariffBracket(
          {
            tariffPlanId: createdPlan.id,
            label: initialLabel,
            fromDay: initialFromDay || "1",
            toDay: initialToDay || "1",
            order: "1",
            isExtraDay: "false",
          },
          { id: actor.id, role: actor.role },
        );
        const refreshed = await listTariffCatalog(createdPlan.id);
        const savedBracket = refreshed.brackets.find(
          (item) =>
            item.label === initialLabel &&
            item.fromDay === Number(initialFromDay || "1") &&
            item.toDay === Number(initialToDay || "1"),
        );
        if (!savedBracket) {
          throw new Error("No se pudo recuperar el tramo inicial");
        }
        await upsertTariffPrice(
          {
            tariffPlanId: createdPlan.id,
            groupCode: initialGroupCode,
            bracketId: savedBracket.id,
            price: initialPrice,
            maxKmPerDay: initialMaxKmPerDay || "0",
          },
          { id: actor.id, role: actor.role },
        );
      }
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error creando tarifa");
      redirect(`/tarifas?error=${encodeURIComponent(message)}`);
    }
    redirect("/tarifas");
  }

  async function saveCourtesyHoursAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    try {
      await updateCompanySettings({ courtesyHours: String(formData.get("courtesyHours") ?? "0") }, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error guardando horas de cortesía");
      redirect(`/tarifas?error=${encodeURIComponent(message)}`);
    }
    redirect("/tarifas?ok=Horas+de+cortesia+guardadas");
  }

  async function saveBracketAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await upsertTariffBracket(input, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error guardando tramo");
      redirect(`/tarifas?tariffPlanId=${encodeURIComponent(input.tariffPlanId ?? "")}&error=${encodeURIComponent(message)}`);
    }
    redirect(`/tarifas?tariffPlanId=${encodeURIComponent(input.tariffPlanId)}`);
  }

  async function saveMatrixAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planId = String(input.tariffPlanId ?? "");
    try {
      for (const [key, value] of Object.entries(input)) {
        if (!key.startsWith("cell__")) continue;
        const parts = key.split("__");
        const groupCode = parts[1] ?? "";
        const bracketId = parts[2] ?? "";
        await upsertTariffPrice(
          {
            tariffPlanId: planId,
            groupCode,
            bracketId,
            price: String(value ?? "0"),
            maxKmPerDay: "0",
          },
          { id: actor.id, role: actor.role },
        );
      }
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error guardando tabla");
      redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
    redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}`);
  }

  async function importTariffCsvAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const csvFile = formData.get("tariffCsvFile");
    if (!(csvFile instanceof File) || csvFile.size === 0) {
      redirect("/tarifas?error=Debes+adjuntar+un+CSV");
    }
    if (csvFile.size > 4 * 1024 * 1024) {
      redirect("/tarifas?error=CSV+demasiado+grande+(max+4MB)");
    }
    let okMessage = "";
    try {
      const csvRaw = Buffer.from(await csvFile.arrayBuffer()).toString("utf8");
      const result = await importTariffCatalogFromCsv(csvRaw, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
      okMessage = `Importación OK: filas ${result.rows}, planes +${result.plansCreated}/${result.plansUpdated} act., tramos +${result.bracketsCreated}/${result.bracketsUpdated} act., precios +${result.pricesCreated}/${result.pricesUpdated} act.`;
    } catch (error) {
      const message = getActionErrorMessage(error, "Error importando tarifas");
      redirect(`/tarifas?error=${encodeURIComponent(message)}`);
    }
    redirect(`/tarifas?ok=${encodeURIComponent(okMessage)}`);
  }

  async function updatePlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planId = String(input.tariffPlanId ?? "");
    try {
      await updateTariffPlan(planId, input, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error actualizando tarifa");
      redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
    redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}`);
  }

  async function deletePlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const planId = String(formData.get("tariffPlanId") ?? "");
    try {
      await deleteTariffPlan(planId, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error borrando tarifa");
      redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
    redirect("/tarifas");
  }

  async function deleteBracketAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const planId = String(formData.get("tariffPlanId") ?? "");
    const bracketId = String(formData.get("bracketId") ?? "");
    try {
      await deleteTariffBracket(bracketId, { id: actor.id, role: actor.role });
      revalidatePath("/tarifas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error borrando tramo");
      redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
    redirect(`/tarifas?tariffPlanId=${encodeURIComponent(planId)}`);
  }

  return (
    <div className="stack-lg">
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p>{params.ok}</p> : null}

      <section className="card stack-sm">
        <h3>Tarifas</h3>
        <form action={createPlanAction} className="inline-search">
          <input name="code" placeholder="Código" required />
          <input name="title" placeholder="Título" required />
          <select name="initialGroupCode" defaultValue="">
            <option value="">Grupo (opcional)</option>
            {vehicleCategories.map((category) => (
              <option key={category.id} value={category.code}>{category.code}</option>
            ))}
          </select>
          <input name="initialBracketLabel" placeholder="Tramo (opcional)" />
          <input name="initialFromDay" type="number" min={1} placeholder="Días desde" />
          <input name="initialToDay" type="number" min={1} placeholder="Días hasta" />
          <input name="initialPrice" type="number" step="0.01" placeholder="Importe" />
          <input name="initialMaxKmPerDay" type="number" step="1" min={0} placeholder="Km/día" />
          <button className="primary-btn" type="submit">Crear</button>
        </form>
        <form method="GET" className="inline-search">
          <input name="q" defaultValue={q} placeholder="Buscar" />
          <select name="tariffPlanId" defaultValue={tariffPlanId}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.code} - {plan.title}</option>
            ))}
          </select>
          <button className="secondary-btn" type="submit">Abrir</button>
        </form>
      </section>

      {catalog.plan ? (
        <>
          <section className="card stack-sm">
            <h3>Configuración de tarifa activa</h3>
            <form action={updatePlanAction} className="form-grid">
              <input type="hidden" name="tariffPlanId" value={catalog.plan.id} />
              <label>
                Código
                <input value={catalog.plan.code} readOnly />
              </label>
              <label>
                Nombre de tarifa *
                <input name="title" defaultValue={catalog.plan.title} required />
              </label>
              <label>
                Fecha desde
                <input name="validFrom" type="date" defaultValue={catalog.plan.validFrom || ""} />
              </label>
              <label>
                Fecha hasta
                <input name="validTo" type="date" defaultValue={catalog.plan.validTo || ""} />
              </label>
              <label>
                Temporada
                <input name="season" defaultValue={catalog.plan.season || ""} />
              </label>
              <label>
                Activa
                <select name="active" defaultValue={catalog.plan.active ? "true" : "false"}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="col-span-2">
                Notas
                <input name="notes" defaultValue={catalog.plan.notes || ""} />
              </label>
              <div className="col-span-2">
                <button className="secondary-btn" type="submit">Guardar configuración</button>
              </div>
            </form>
            <form action={deletePlanAction} className="inline-search">
              <input type="hidden" name="tariffPlanId" value={catalog.plan.id} />
              <button className="secondary-btn" type="submit">Borrar tarifa</button>
            </form>
          </section>

          <section className="card stack-sm">
            <h3>Tramos de la tarifa</h3>
            <form action={saveBracketAction} className="inline-search">
              <input type="hidden" name="tariffPlanId" value={catalog.plan.id} />
              <input name="label" placeholder="Etiqueta" required />
              <input name="fromDay" type="number" min={1} placeholder="Desde" required />
              <input name="toDay" type="number" min={1} placeholder="Hasta" required />
              <input name="order" type="number" min={1} placeholder="Orden" />
              <select name="isExtraDay" defaultValue="false">
                <option value="false">Normal</option>
                <option value="true">Extra</option>
              </select>
              <button className="secondary-btn" type="submit">Añadir tramo</button>
            </form>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Etiqueta</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Orden</th>
                    <th>Extra</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.brackets.length === 0 ? (
                    <tr><td colSpan={6} className="muted-text">Sin tramos.</td></tr>
                  ) : (
                    catalog.brackets.map((bracket) => (
                      <tr key={bracket.id}>
                        <td>{bracket.label}</td>
                        <td>{bracket.fromDay}</td>
                        <td>{bracket.toDay}</td>
                        <td>{bracket.order}</td>
                        <td>{bracket.isExtraDay ? "Sí" : "No"}</td>
                        <td>
                          <details>
                            <summary>Editar / Borrar</summary>
                            <form action={saveBracketAction} className="mini-form">
                              <input type="hidden" name="tariffPlanId" value={tariffPlanId} />
                              <input type="hidden" name="bracketId" value={bracket.id} />
                              <label>Etiqueta<input name="label" defaultValue={bracket.label} /></label>
                              <label>Desde<input name="fromDay" type="number" defaultValue={String(bracket.fromDay)} /></label>
                              <label>Hasta<input name="toDay" type="number" defaultValue={String(bracket.toDay)} /></label>
                              <label>Orden<input name="order" type="number" defaultValue={String(bracket.order)} /></label>
                              <label>Extra<select name="isExtraDay" defaultValue={bracket.isExtraDay ? "true" : "false"}><option value="false">No</option><option value="true">Sí</option></select></label>
                              <button className="secondary-btn" type="submit">Guardar tramo</button>
                            </form>
                            <form action={deleteBracketAction} className="mini-form">
                              <input type="hidden" name="tariffPlanId" value={tariffPlanId} />
                              <input type="hidden" name="bracketId" value={bracket.id} />
                              <button className="secondary-btn" type="submit">Borrar tramo</button>
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
            <h3>Tabla de precios</h3>
            <form action={saveMatrixAction} className="stack-sm">
              <input type="hidden" name="tariffPlanId" value={catalog.plan.id} />
              <div className="table-wrap">
                <table className="data-table excel-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      {catalog.brackets.map((bracket) => (
                        <th key={`h-${bracket.id}`}>{bracket.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.groups.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(2, catalog.brackets.length + 1)} className="muted-text">Sin grupos.</td>
                      </tr>
                    ) : (
                      catalog.groups.map((group) => (
                        <tr key={`r-${group}`}>
                          <td><strong>{group}</strong></td>
                          {catalog.brackets.map((bracket) => {
                            const current = catalog.prices.find(
                              (item) => item.groupCode === group && item.bracketId === bracket.id,
                            );
                            return (
                              <td key={`c-${group}-${bracket.id}`}>
                                <div className="excel-cell">
                                  <input
                                    className="excel-input"
                                    name={`cell__${group}__${bracket.id}`}
                                    type="number"
                                    step="0.01"
                                    defaultValue={String(current?.price ?? 0)}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button className="primary-btn" type="submit">Guardar tabla</button>
            </form>
          </section>
        </>
      ) : null}

      <section className="card stack-sm">
        <h3>Horas de cortesía</h3>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)", gap: "0.9rem", alignItems: "stretch" }}>
          <form action={saveCourtesyHoursAction} className="inline-search" style={{ alignItems: "center", margin: 0 }}>
            <input name="courtesyHours" type="number" min={0} step="1" defaultValue={String(settings.courtesyHours ?? 0)} style={{ maxWidth: 96 }} />
            <button className="secondary-btn" type="submit">Guardar</button>
          </form>
          <div className="card-muted" style={{ padding: "0.85rem 1rem", display: "grid", gap: "0.45rem" }}>
            <div className="table-header-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
              <strong>Aplicación global</strong>
              <strong>{settings.courtesyHours ?? 0} h</strong>
            </div>
            <div className="table-header-row" style={{ justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: 0 }}>
              <span className="muted-text">Todas las tarifas</span>
              <span className="muted-text">Bloques de 24h</span>
              <span className="muted-text">Exceso &gt; cortesía = +1 día</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card stack-sm">
        <h3>Importación por archivo (CSV estándar)</h3>
        <form action={importTariffCsvAction} className="inline-search import-compact">
          <input name="tariffCsvFile" type="file" accept=".csv,text/csv" required />
          <button className="secondary-btn" type="submit">Importar CSV</button>
        </form>
      </section>
    </div>
  );
}
