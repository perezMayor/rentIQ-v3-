import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createFullBackup, listBackups, restoreBackup } from "@/lib/services/backup-service";
import {
  createUserAccount,
  createDailyOperationalExpense,
  createTariffPlan,
  createTemplate,
  deleteUserAccount,
  deleteInternalExpense,
  deleteTariffBracket,
  deleteTariffPlan,
  deleteTemplate,
  getCompanySettings,
  listUserAccounts,
  listActiveRentalPlatesByDate,
  listDailyOperationalExpenses,
  listTariffCatalog,
  listTariffPlans,
  listTemplates,
  setUserAccountActive,
  updateCompanySettings,
  updateInternalExpense,
  updateTariffPlan,
  updateUserAccount,
  updateTemplate,
  upsertTariffBracket,
  upsertTariffPrice,
  validateDailyOperationalExpenses,
} from "@/lib/services/rental-service";

type GestorTab = "usuarios" | "sucursales" | "tarifas" | "gastos" | "plantillas" | "backups";

type Props = {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    ok?: string;
    qBackup?: string;
    page?: string;
    qTariff?: string;
    tariffPlanId?: string;
    from?: string;
    to?: string;
    plate?: string;
    worker?: string;
    expenseDate?: string;
    qTemplate?: string;
    qUser?: string;
  }>;
};

function normalizeTab(value: string): GestorTab {
  if (value === "usuarios" || value === "sucursales" || value === "tarifas" || value === "gastos" || value === "plantillas" || value === "backups") {
    return value;
  }
  return "usuarios";
}

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default async function GestorPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "LECTOR") redirect("/dashboard");

  const params = await searchParams;
  const tab = normalizeTab((params.tab ?? "usuarios").toLowerCase());
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const settings = await getCompanySettings();

  const qBackup = (params.qBackup ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const backupsAll = await listBackups();
  const pageSize = 10;
  const backupsFiltered = qBackup
    ? backupsAll.filter((item) =>
        [item.backupId, item.reason, item.status, item.createdAt, item.checksum, item.failureReason].join(" ").toLowerCase().includes(qBackup),
      )
    : backupsAll;
  const totalPages = Math.max(1, Math.ceil(backupsFiltered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const backups = backupsFiltered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const lastBackup = backupsFiltered[0] ?? null;

  const qTariff = params.qTariff ?? "";
  const tariffPlans = await listTariffPlans(qTariff);
  const tariffPlanId = params.tariffPlanId ?? tariffPlans[0]?.id ?? "";
  const tariffCatalog = tariffPlanId ? await listTariffCatalog(tariffPlanId) : { plan: null, brackets: [], groups: [], prices: [] };

  const range = getDefaultRange();
  const from = params.from ?? range.from;
  const to = params.to ?? range.to;
  const plate = params.plate ?? "";
  const worker = params.worker ?? "";
  const expenseDate = params.expenseDate ?? new Date().toISOString().slice(0, 10);
  const activePlates = await listActiveRentalPlatesByDate(expenseDate);
  const dailyExpenses = await listDailyOperationalExpenses({ from, to, plate, worker });
  const expensesValidation = await validateDailyOperationalExpenses({ from, to });

  const qTemplate = params.qTemplate ?? "";
  const templates = await listTemplates(qTemplate);
  const qUser = params.qUser ?? "";
  const users = await listUserAccounts(qUser);

  async function saveCompanySettingsAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=sucursales&error=Permiso+denegado");
    try {
      await updateCompanySettings(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/gestor");
      redirect("/gestor?tab=sucursales&ok=Sucursales+guardadas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando configuración";
      redirect(`/gestor?tab=sucursales&error=${encodeURIComponent(message)}`);
    }
  }

  async function createUserAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=usuarios&error=Permiso+denegado");
    try {
      await createUserAccount(Object.fromEntries(formData.entries()) as Record<string, string>, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&ok=Usuario+creado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando usuario";
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateUserAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=usuarios&error=Permiso+denegado");
    const userId = String(formData.get("userId") ?? "");
    try {
      await updateUserAccount(userId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&ok=Usuario+actualizado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando usuario";
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function setUserStatusAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=usuarios&error=Permiso+denegado");
    const userId = String(formData.get("userId") ?? "");
    const active = String(formData.get("active") ?? "false") === "true";
    try {
      await setUserAccountActive(userId, active, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&ok=Estado+de+usuario+actualizado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando estado";
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=usuarios&error=Permiso+denegado");
    const userId = String(formData.get("userId") ?? "");
    try {
      await deleteUserAccount(userId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&ok=Usuario+borrado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando usuario";
      redirect(`/gestor?tab=usuarios&qUser=${encodeURIComponent(qUser)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createTariffPlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    try {
      await createTariffPlan(Object.fromEntries(formData.entries()) as Record<string, string>, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect("/gestor?tab=tarifas&ok=Tarifa+creada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando tarifa";
      redirect(`/gestor?tab=tarifas&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateTariffPlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planId = String(input.tariffPlanId ?? "");
    try {
      await updateTariffPlan(planId, input, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&ok=Tarifa+actualizada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando tarifa";
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteTariffPlanAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const planId = String(formData.get("tariffPlanId") ?? "");
    try {
      await deleteTariffPlan(planId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect("/gestor?tab=tarifas&ok=Tarifa+borrada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando tarifa";
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function saveTariffBracketAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planId = String(input.tariffPlanId ?? "");
    try {
      await upsertTariffBracket(input, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&ok=Tramo+guardado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando tramo";
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteTariffBracketAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const planId = String(formData.get("tariffPlanId") ?? "");
    const bracketId = String(formData.get("bracketId") ?? "");
    try {
      await deleteTariffBracket(bracketId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&ok=Tramo+borrado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando tramo";
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function saveTariffMatrixAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const planId = String(input.tariffPlanId ?? "");
    try {
      for (const [key, value] of Object.entries(input)) {
        if (!key.startsWith("cell__")) continue;
        const [, groupCode, bracketId] = key.split("__");
        await upsertTariffPrice(
          {
            tariffPlanId: planId,
            groupCode: groupCode ?? "",
            bracketId: bracketId ?? "",
            price: String(value ?? "0"),
            maxKmPerDay: "0",
          },
          { id: actor.id, role: actor.role },
        );
      }
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&ok=Tabla+guardada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando tabla";
      redirect(`/gestor?tab=tarifas&tariffPlanId=${encodeURIComponent(planId)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createDailyExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=gastos&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createDailyOperationalExpense(input, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/gastos");
      revalidatePath("/vehiculos");
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&ok=Gasto+guardado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando gasto";
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateDailyExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=gastos&error=Permiso+denegado");
    const expenseId = String(formData.get("expenseId") ?? "");
    try {
      await updateInternalExpense(expenseId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/gestor");
      revalidatePath("/gastos");
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&ok=Gasto+actualizado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando gasto";
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteDailyExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=gastos&error=Permiso+denegado");
    const expenseId = String(formData.get("expenseId") ?? "");
    try {
      await deleteInternalExpense(expenseId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/gastos");
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&ok=Gasto+borrado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando gasto";
      redirect(`/gestor?tab=gastos&from=${from}&to=${to}&plate=${encodeURIComponent(plate)}&worker=${encodeURIComponent(worker)}&expenseDate=${encodeURIComponent(expenseDate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=plantillas&error=Permiso+denegado");
    try {
      await createTemplate(Object.fromEntries(formData.entries()) as Record<string, string>, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/plantillas");
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&ok=Plantilla+creada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando plantilla";
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=plantillas&error=Permiso+denegado");
    try {
      await updateTemplate(Object.fromEntries(formData.entries()) as Record<string, string>, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/plantillas");
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&ok=Plantilla+actualizada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando plantilla";
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=plantillas&error=Permiso+denegado");
    const templateId = String(formData.get("templateId") ?? "");
    try {
      await deleteTemplate(templateId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/plantillas");
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&ok=Plantilla+borrada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando plantilla";
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function forceBackupAction() {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role !== "SUPER_ADMIN") redirect("/gestor?tab=backups&error=Solo+Super+admin");

    const result = await createFullBackup("FORCED", { id: actor.id, role: actor.role });
    revalidatePath("/gestor");
    if (result.status === "SUCCESS") {
      redirect(`/gestor?tab=backups&ok=${encodeURIComponent(`Backup ${result.backupId} completado`)}`);
    }
    redirect(`/gestor?tab=backups&error=${encodeURIComponent(result.failureReason || "Backup fallido")}`);
  }

  async function restoreBackupAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role !== "SUPER_ADMIN") redirect("/gestor?tab=backups&error=Solo+Super+admin");

    const backupId = String(formData.get("backupId") ?? "");
    const confirmStep1 = String(formData.get("confirmStep1") ?? "false") === "true";
    const confirmStep2 = String(formData.get("confirmStep2") ?? "") === "RESTAURAR";
    if (!confirmStep1 || !confirmStep2) {
      redirect("/gestor?tab=backups&error=Falta+doble+confirmacion");
    }

    try {
      await restoreBackup(backupId, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=backups&ok=${encodeURIComponent(`Restore completado desde ${backupId}`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Restore fallido";
      redirect(`/gestor?tab=backups&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Gestor</h2>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p>{params.ok}</p> : null}

      <section className="card stack-sm">
        <div className="inline-actions-cell">
          <a className={tab === "usuarios" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=usuarios">Usuarios</a>
          <a className={tab === "sucursales" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=sucursales">Sucursales</a>
          <a className={tab === "tarifas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=tarifas">Tarifas</a>
          <a className={tab === "gastos" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=gastos">Gastos</a>
          <a className={tab === "plantillas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=plantillas">Plantillas</a>
          <a className={tab === "backups" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=backups">Backups</a>
        </div>
      </section>

      {tab === "usuarios" ? (
        <>
          <section className="card stack-sm">
            <h3>Nuevo usuario</h3>
            <form action={createUserAction} className="form-grid">
              <label>Nombre<input name="name" required /></label>
              <label>Email<input name="email" type="email" required /></label>
              <label>Password<input name="password" type="password" required /></label>
              <label>
                Rol
                <select name="role" defaultValue="LECTOR">
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="LECTOR">LECTOR</option>
                </select>
              </label>
              <label>
                Activo
                <select name="active" defaultValue="true">
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
              <div className="col-span-2">
                <button className="primary-btn" type="submit">Crear usuario</button>
              </div>
            </form>
          </section>

          <section className="card stack-sm">
            <div className="table-header-row">
              <h3>Listado de usuarios</h3>
              <form method="GET" className="inline-search">
                <input type="hidden" name="tab" value="usuarios" />
                <input name="qUser" defaultValue={qUser} placeholder="nombre, email o rol..." />
                <button className="secondary-btn" type="submit">Buscar</button>
              </form>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={5} className="muted-text">Sin usuarios.</td></tr>
                  ) : (
                    users.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.email}</td>
                        <td>{item.role}</td>
                        <td>{item.active ? "Sí" : "No"}</td>
                        <td>
                          <details>
                            <summary>Editar / Estado / Borrar</summary>
                            <form action={updateUserAction} className="mini-form">
                              <input type="hidden" name="userId" value={item.id} />
                              <label>Nombre<input name="name" defaultValue={item.name} /></label>
                              <label>Email<input name="email" type="email" defaultValue={item.email} /></label>
                              <label>
                                Rol
                                <select name="role" defaultValue={item.role}>
                                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="LECTOR">LECTOR</option>
                                </select>
                              </label>
                              <label>Password nueva (opcional)<input name="password" type="password" placeholder="Solo si cambias" /></label>
                              <label>
                                Activo
                                <select name="active" defaultValue={item.active ? "true" : "false"}>
                                  <option value="true">Sí</option>
                                  <option value="false">No</option>
                                </select>
                              </label>
                              <button className="secondary-btn" type="submit">Guardar usuario</button>
                            </form>
                            <form action={setUserStatusAction} className="mini-form">
                              <input type="hidden" name="userId" value={item.id} />
                              <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                              <button className="secondary-btn" type="submit">{item.active ? "Desactivar" : "Activar"}</button>
                            </form>
                            <form action={deleteUserAction} className="mini-form">
                              <input type="hidden" name="userId" value={item.id} />
                              <button className="secondary-btn" type="submit">Borrar usuario</button>
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
        </>
      ) : null}

      {tab === "sucursales" ? (
        <section className="card stack-sm">
          <h3>Sucursales</h3>
          <form action={saveCompanySettingsAction} className="form-grid">
            <label className="col-span-2">
              Sucursales (1 por línea: CODIGO|NOMBRE)
              <textarea name="branchesRaw" rows={8} defaultValue={settings.branches.map((branch) => `${branch.code}|${branch.name}`).join("\n")} />
            </label>
            <input type="hidden" name="companyName" value={settings.companyName} readOnly />
            <input type="hidden" name="companyEmailFrom" value={settings.companyEmailFrom} readOnly />
            <input type="hidden" name="taxId" value={settings.taxId} readOnly />
            <input type="hidden" name="fiscalAddress" value={settings.fiscalAddress} readOnly />
            <input type="hidden" name="defaultIvaPercent" value={String(settings.defaultIvaPercent)} readOnly />
            <input type="hidden" name="backupRetentionDays" value={String(settings.backupRetentionDays)} readOnly />
            <input type="hidden" name="invoiceSeriesF" value={settings.invoiceSeriesByType.F} readOnly />
            <input type="hidden" name="invoiceSeriesR" value={settings.invoiceSeriesByType.R} readOnly />
            <input type="hidden" name="invoiceSeriesV" value={settings.invoiceSeriesByType.V} readOnly />
            <input type="hidden" name="invoiceSeriesA" value={settings.invoiceSeriesByType.A} readOnly />
            <input type="hidden" name="providersRaw" value={(settings.providers ?? []).join("\n")} readOnly />
            <div className="col-span-2">
              <button className="primary-btn" type="submit">Guardar sucursales</button>
            </div>
          </form>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Nombre</th></tr></thead>
              <tbody>
                {settings.branches.length === 0 ? (
                  <tr><td colSpan={2} className="muted-text">Sin sucursales.</td></tr>
                ) : (
                  settings.branches.map((branchItem) => (
                    <tr key={branchItem.code}><td>{branchItem.code}</td><td>{branchItem.name}</td></tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "tarifas" ? (
        <>
          <section className="card stack-sm">
            <h3>Tarifas</h3>
            <form action={createTariffPlanAction} className="inline-search">
              <input name="code" placeholder="Código" required />
              <input name="title" placeholder="Título" required />
              <button className="primary-btn" type="submit">Crear tarifa</button>
            </form>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="tarifas" />
              <input name="qTariff" defaultValue={qTariff} placeholder="Buscar" />
              <select name="tariffPlanId" defaultValue={tariffPlanId}>
                {tariffPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.code} - {plan.title}</option>
                ))}
              </select>
              <button className="secondary-btn" type="submit">Abrir</button>
            </form>
          </section>

          {tariffCatalog.plan ? (
            <>
              <section className="card stack-sm">
                <h3>Configuración tarifa</h3>
                <form action={updateTariffPlanAction} className="form-grid">
                  <input type="hidden" name="tariffPlanId" value={tariffCatalog.plan.id} />
                  <label>Código<input value={tariffCatalog.plan.code} readOnly /></label>
                  <label>Nombre<input name="title" defaultValue={tariffCatalog.plan.title} required /></label>
                  <label>Desde<input name="validFrom" type="date" defaultValue={tariffCatalog.plan.validFrom || ""} /></label>
                  <label>Hasta<input name="validTo" type="date" defaultValue={tariffCatalog.plan.validTo || ""} /></label>
                  <label>Temporada<input name="season" defaultValue={tariffCatalog.plan.season || ""} /></label>
                  <label>
                    Activa
                    <select name="active" defaultValue={tariffCatalog.plan.active ? "true" : "false"}>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                  <label className="col-span-2">Notas<input name="notes" defaultValue={tariffCatalog.plan.notes || ""} /></label>
                  <div className="col-span-2"><button className="secondary-btn" type="submit">Guardar tarifa</button></div>
                </form>
                <form action={deleteTariffPlanAction} className="inline-search">
                  <input type="hidden" name="tariffPlanId" value={tariffCatalog.plan.id} />
                  <button className="secondary-btn" type="submit">Borrar tarifa</button>
                </form>
              </section>

              <section className="card stack-sm">
                <h3>Tramos</h3>
                <form action={saveTariffBracketAction} className="inline-search">
                  <input type="hidden" name="tariffPlanId" value={tariffCatalog.plan.id} />
                  <input name="label" placeholder="Etiqueta" required />
                  <input name="fromDay" type="number" min={1} placeholder="Desde" required />
                  <input name="toDay" type="number" min={1} placeholder="Hasta" required />
                  <input name="order" type="number" min={1} placeholder="Orden" />
                  <select name="isExtraDay" defaultValue="false"><option value="false">Normal</option><option value="true">Extra</option></select>
                  <button className="secondary-btn" type="submit">Añadir tramo</button>
                </form>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Etiqueta</th><th>Desde</th><th>Hasta</th><th>Orden</th><th>Extra</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {tariffCatalog.brackets.length === 0 ? (
                        <tr><td colSpan={6} className="muted-text">Sin tramos.</td></tr>
                      ) : (
                        tariffCatalog.brackets.map((bracket) => (
                          <tr key={bracket.id}>
                            <td>{bracket.label}</td>
                            <td>{bracket.fromDay}</td>
                            <td>{bracket.toDay}</td>
                            <td>{bracket.order}</td>
                            <td>{bracket.isExtraDay ? "Sí" : "No"}</td>
                            <td>
                              <details>
                                <summary>Editar / Borrar</summary>
                                <form action={saveTariffBracketAction} className="mini-form">
                                  <input type="hidden" name="tariffPlanId" value={tariffPlanId} />
                                  <input type="hidden" name="bracketId" value={bracket.id} />
                                  <label>Etiqueta<input name="label" defaultValue={bracket.label} /></label>
                                  <label>Desde<input name="fromDay" type="number" defaultValue={String(bracket.fromDay)} /></label>
                                  <label>Hasta<input name="toDay" type="number" defaultValue={String(bracket.toDay)} /></label>
                                  <label>Orden<input name="order" type="number" defaultValue={String(bracket.order)} /></label>
                                  <label>Extra<select name="isExtraDay" defaultValue={bracket.isExtraDay ? "true" : "false"}><option value="false">No</option><option value="true">Sí</option></select></label>
                                  <button className="secondary-btn" type="submit">Guardar tramo</button>
                                </form>
                                <form action={deleteTariffBracketAction} className="mini-form">
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
                <form action={saveTariffMatrixAction} className="stack-sm">
                  <input type="hidden" name="tariffPlanId" value={tariffCatalog.plan.id} />
                  <div className="table-wrap">
                    <table className="data-table excel-table">
                      <thead>
                        <tr>
                          <th>Grupo</th>
                          {tariffCatalog.brackets.map((bracket) => (
                            <th key={`h-${bracket.id}`}>{bracket.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tariffCatalog.groups.length === 0 ? (
                          <tr><td colSpan={Math.max(2, tariffCatalog.brackets.length + 1)} className="muted-text">Sin grupos.</td></tr>
                        ) : (
                          tariffCatalog.groups.map((groupItem) => (
                            <tr key={`r-${groupItem}`}>
                              <td><strong>{groupItem}</strong></td>
                              {tariffCatalog.brackets.map((bracket) => {
                                const current = tariffCatalog.prices.find((item) => item.groupCode === groupItem && item.bracketId === bracket.id);
                                return (
                                  <td key={`c-${groupItem}-${bracket.id}`}>
                                    <input name={`cell__${groupItem}__${bracket.id}`} defaultValue={String(current?.price ?? 0)} type="number" step="0.01" />
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
        </>
      ) : null}

      {tab === "gastos" ? (
        <>
          <section className="card stack-sm">
            <h3>Nuevo gasto diario</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="gastos" />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="plate" value={plate} />
              <input type="hidden" name="worker" value={worker} />
              <label>Fecha referencia matrículas<input name="expenseDate" type="date" defaultValue={expenseDate} /></label>
              <button className="secondary-btn" type="submit">Actualizar matrículas válidas</button>
            </form>
            <form action={createDailyExpenseAction} className="form-grid">
              <label>Fecha *<input name="expenseDate" type="date" required defaultValue={expenseDate} /></label>
              <label>Empleado *<input name="workerName" required placeholder="Nombre" defaultValue={user.name} /></label>
              <label>
                Categoría *
                <select name="category" defaultValue="GASOLINA">
                  <option value="PEAJE">Peaje</option>
                  <option value="GASOLINA">Gasolina</option>
                  <option value="COMIDA">Comida</option>
                  <option value="PARKING">Parking</option>
                  <option value="LAVADO">Lavado</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label>Importe total *<input name="amount" type="number" step="0.01" min="0.01" required /></label>
              <label className="col-span-2">Matrículas *<textarea name="vehiclePlates" rows={3} required placeholder="1234ABC, 5678DEF" /></label>
              <label className="col-span-2">Nota<input name="note" placeholder="Opcional" /></label>
              <div className="col-span-2"><button className="primary-btn" type="submit">Guardar gasto diario</button></div>
            </form>
            <details>
              <summary>Ver matrículas con alquiler activo ({expenseDate})</summary>
              <p className="muted-text">{activePlates.length === 0 ? "Sin matrículas activas ese día." : activePlates.map((item) => `${item.plate} (${item.groupLabel} - ${item.modelLabel})`).join(", ")}</p>
            </details>
          </section>

          <section className="card stack-sm">
            <h3>Validación operativa</h3>
            <p className="muted-text">Estado: {expensesValidation.ok ? "OK" : "CON INCIDENCIAS"}</p>
            <p className="muted-text">Registros: {expensesValidation.totalRows}</p>
            <p className="muted-text">Sin batch: {expensesValidation.noBatch}</p>
            <p className="muted-text">Sin empleado: {expensesValidation.noWorker}</p>
            <p className="muted-text">Matrícula fuera flota: {expensesValidation.notInFleet}</p>
            <p className="muted-text">Sin alquiler activo: {expensesValidation.withoutActiveRental}</p>
          </section>

          <section className="card stack-sm">
            <div className="table-header-row">
              <h3>Histórico gastos</h3>
              <form method="GET" className="inline-search">
                <input type="hidden" name="tab" value="gastos" />
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
                <thead><tr><th>Fecha</th><th>Matrícula</th><th>Categoría</th><th>Importe</th><th>Batch</th><th>Empleado</th><th>Detalle</th><th>Acciones</th></tr></thead>
                <tbody>
                  {dailyExpenses.rows.length === 0 ? (
                    <tr><td colSpan={8} className="muted-text">Sin gastos en rango.</td></tr>
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
                            <form action={updateDailyExpenseAction} className="mini-form">
                              <input type="hidden" name="expenseId" value={row.id} />
                              <label>Fecha<input name="expenseDate" type="date" defaultValue={row.expenseDate} /></label>
                              <label>Matrícula<input name="vehiclePlate" defaultValue={row.vehiclePlate} /></label>
                              <label>Categoría<select name="category" defaultValue={row.category}><option value="PEAJE">Peaje</option><option value="GASOLINA">Gasolina</option><option value="COMIDA">Comida</option><option value="PARKING">Parking</option><option value="LAVADO">Lavado</option><option value="OTRO">Otro</option></select></label>
                              <label>Importe<input name="amount" type="number" step="0.01" defaultValue={row.amount.toFixed(2)} /></label>
                              <label>Empleado<input name="workerName" defaultValue={row.workerName} /></label>
                              <label>Nota<input name="note" defaultValue={row.note} /></label>
                              <button className="secondary-btn" type="submit">Guardar</button>
                            </form>
                            <form action={deleteDailyExpenseAction} className="mini-form">
                              <input type="hidden" name="expenseId" value={row.id} />
                              <button className="secondary-btn" type="submit">Borrar gasto</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted-text">Total asignado: {dailyExpenses.totalAmount.toFixed(2)}</p>
          </section>
        </>
      ) : null}

      {tab === "plantillas" ? (
        <>
          <section className="card stack-md">
            <h3>Nueva plantilla</h3>
            <form action={createTemplateAction} className="form-grid">
              <label>Código plantilla<input name="templateCode" placeholder="CTR_BASE" /></label>
              <label>
                Tipo
                <select name="templateType" defaultValue="CONTRATO">
                  <option value="CONTRATO">Contrato</option>
                  <option value="CONFIRMACION_RESERVA">Confirmación reserva</option>
                  <option value="FACTURA">Factura</option>
                </select>
              </label>
              <label>Idioma<input name="language" placeholder="es" /></label>
              <label>Título<input name="title" placeholder="Contrato base ES" /></label>
              <label className="col-span-2">HTML<textarea name="htmlContent" rows={8} defaultValue={'<section><h1>{{company_name}}</h1><p>Contrato {{contract_number}}</p></section>'} /></label>
              <div className="col-span-2"><button className="primary-btn" type="submit">Guardar plantilla</button></div>
            </form>
          </section>

          <section className="card stack-sm">
            <div className="table-header-row">
              <h3>Listado plantillas</h3>
              <form method="GET" className="inline-search">
                <input type="hidden" name="tab" value="plantillas" />
                <input name="qTemplate" defaultValue={qTemplate} placeholder="código, tipo, idioma..." />
                <button className="secondary-btn" type="submit">Buscar</button>
              </form>
            </div>
            {templates.length === 0 ? (
              <p className="muted-text">Sin plantillas.</p>
            ) : (
              <div className="stack-md">
                {templates.map((template) => (
                  <details key={template.id} className="card">
                    <summary>{template.templateCode} | {template.templateType} | {template.language} | {template.active ? "Activa" : "Inactiva"}</summary>
                    <form action={updateTemplateAction} className="stack-sm" style={{ marginTop: "0.75rem" }}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <label>Título<input name="title" defaultValue={template.title} /></label>
                      <label>Idioma<input name="language" defaultValue={template.language} /></label>
                      <label>Activa<select name="active" defaultValue={template.active ? "true" : "false"}><option value="true">Sí</option><option value="false">No</option></select></label>
                      <label>HTML<textarea name="htmlContent" defaultValue={template.htmlContent} rows={10} /></label>
                      <button className="secondary-btn" type="submit">Actualizar</button>
                    </form>
                    <form action={deleteTemplateAction} className="stack-sm" style={{ marginTop: "0.75rem" }}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <button className="secondary-btn" type="submit">Borrar plantilla</button>
                    </form>
                    <details style={{ marginTop: "0.5rem" }}>
                      <summary>Vista previa HTML</summary>
                      <div className="html-preview" dangerouslySetInnerHTML={{ __html: template.htmlContent }} />
                    </details>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "backups" ? (
        <>
          <section className="card stack-sm">
            <h3>Backups</h3>
            <p className="muted-text">Backup FULL diario objetivo: 03:00 Europe/Madrid.</p>
            <p className="muted-text">Retención actual: {settings.backupRetentionDays} días.</p>
            <p className="muted-text">Último backup: {lastBackup ? `${lastBackup.backupId} (${lastBackup.status}) ${lastBackup.createdAt}` : "Sin backups"}</p>
            <form action={forceBackupAction}>
              <button className="primary-btn" type="submit" disabled={!isSuperAdmin}>Forzar backup (Super admin)</button>
            </form>
          </section>

          <section className="card stack-sm">
            <h3>Histórico backups</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="backups" />
              <input name="qBackup" defaultValue={qBackup} placeholder="ID, estado, motivo, checksum..." />
              <button className="secondary-btn" type="submit">Buscar</button>
            </form>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>ID</th><th>Fecha/hora</th><th>Motivo</th><th>Estado</th><th>Tamaño</th><th>Duración ms</th><th>Checksum</th><th>Restore</th></tr></thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr><td colSpan={8} className="muted-text">Sin backups.</td></tr>
                  ) : (
                    backups.map((backup) => (
                      <tr key={backup.backupId}>
                        <td>{backup.backupId}</td>
                        <td>{backup.createdAt}</td>
                        <td>{backup.reason}</td>
                        <td>{backup.status}</td>
                        <td>{backup.totalSizeBytes}</td>
                        <td>{backup.durationMs}</td>
                        <td>{backup.checksum || "N/D"}</td>
                        <td>
                          <details>
                            <summary>Restaurar</summary>
                            <form action={restoreBackupAction} className="stack-sm">
                              <input type="hidden" name="backupId" value={backup.backupId} />
                              <label>
                                Confirmo impacto en producción
                                <select name="confirmStep1" defaultValue="false" disabled={!isSuperAdmin}>
                                  <option value="false">No</option>
                                  <option value="true">Sí</option>
                                </select>
                              </label>
                              <label>
                                Escribe RESTAURAR
                                <input name="confirmStep2" disabled={!isSuperAdmin} />
                              </label>
                              <button className="secondary-btn" type="submit" disabled={!isSuperAdmin}>Restaurar (Super admin)</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="inline-search">
              <a className="secondary-btn text-center" href={`/gestor?tab=backups&qBackup=${encodeURIComponent(qBackup)}&page=${Math.max(1, safePage - 1)}`}>Página anterior</a>
              <p className="muted-text">Página {safePage} de {totalPages}</p>
              <a className="secondary-btn text-center" href={`/gestor?tab=backups&qBackup=${encodeURIComponent(qBackup)}&page=${Math.min(totalPages, safePage + 1)}`}>Página siguiente</a>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
