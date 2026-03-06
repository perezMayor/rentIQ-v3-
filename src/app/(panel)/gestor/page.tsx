// Página del módulo gestor.
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
  importTariffCatalogFromCsv,
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
import { TEMPLATE_MACRO_GROUPS } from "@/lib/services/template-macro-catalog";
import { getTemplatePresetHtml } from "@/lib/services/template-presets";
import styles from "./gestor.module.css";
import { ModuleHelp } from "@/components/module-help";

type GestorTab = "usuarios" | "sucursales" | "tarifas" | "gastos" | "plantillas" | "backups";
type BranchEditorView = "general" | "horarios";

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
    view?: string;
    branchCode?: string;
    branchView?: string;
    branchCodeDraft?: string;
    branchNameDraft?: string;
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

function serializeBranchesRaw(rows: Array<{ code: string; name: string }>) {
  return rows.map((item) => `${item.code}|${item.name}`).join("\n");
}

const WEEKLY_DAY_FIELDS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;
const PERIOD_OPTIONS = ["POR DEFECTO", "VERANO", "INVIERNO", "FESTIVOS", "OPERATIVO"] as const;

function defaultBranchSchedule(actorId: string) {
  const nowIso = new Date().toISOString();
  return {
    periodLabel: "POR DEFECTO",
    timezone: "Europe/Madrid",
    language: "es",
    weekly: {
      monday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      tuesday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      wednesday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      thursday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      friday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      saturday: { enabled: true, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
      sunday: { enabled: false, start1: "08:00", end1: "13:00", start2: "16:00", end2: "20:00" },
    },
    exceptions: [],
    updatedAt: nowIso,
    updatedBy: actorId,
  };
}

function normalizeTime(input: string, fallback: string) {
  const value = input.trim();
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

export default async function GestorPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "LECTOR") redirect("/dashboard");

  const params = await searchParams;
  const tab = normalizeTab((params.tab ?? "usuarios").toLowerCase());
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const settings = await getCompanySettings();
  const selectedBranchCode = (params.branchCode ?? "").trim().toUpperCase() || settings.branches[0]?.code || "";
  const branchView: BranchEditorView = params.branchView === "horarios" ? "horarios" : "general";
  const selectedBranch = settings.branches.find((item) => item.code === selectedBranchCode) ?? null;
  const draftBranchCode = params.branchCodeDraft ?? selectedBranch?.code ?? "";
  const draftBranchName = params.branchNameDraft ?? selectedBranch?.name ?? "";
  const selectedBranchSchedule =
    selectedBranchCode && settings.branchSchedules?.[selectedBranchCode]
      ? settings.branchSchedules[selectedBranchCode]
      : defaultBranchSchedule(user.id);
  const exceptionRows = Array.from({ length: Math.max(8, selectedBranchSchedule.exceptions.length + 2) }).map((_, index) => {
    const item = selectedBranchSchedule.exceptions[index];
    return {
      date: item?.date ?? "",
      mode: item?.mode ?? "ABIERTA",
      start1: item?.start1 ?? "08:00",
      end1: item?.end1 ?? "13:00",
      start2: item?.start2 ?? "16:00",
      end2: item?.end2 ?? "20:00",
      note: item?.note ?? "",
    };
  });

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
  const panelView = params.view === "amplia" ? "amplia" : "compacta";
  const panelColumns = panelView === "compacta" ? "minmax(0,1fr) minmax(0,1fr)" : "1fr";
  const panelMinHeight = panelView === "compacta" ? "430px" : "auto";
  const panelMaxHeight = panelView === "compacta" ? "430px" : "none";
  const panelScroll = panelView === "compacta" ? "auto" : "visible";
  const templates = await listTemplates(qTemplate);
  const templatesInUse = (await listTemplates("")).filter((item) => item.active);
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

  async function upsertBranchAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=sucursales&error=Permiso+denegado");

    const code = String(formData.get("branchCode") ?? "").trim().toUpperCase();
    const name = String(formData.get("branchName") ?? "").trim();

    if (!code) {
      redirect("/gestor?tab=sucursales&error=El+código+de+la+sucursal+es+obligatorio");
    }
    if (!name) {
      redirect(`/gestor?tab=sucursales&branchCodeDraft=${encodeURIComponent(code)}&error=El+nombre+de+la+sucursal+es+obligatorio`);
    }

    const current = await getCompanySettings();
    const next = current.branches.filter((item) => item.code !== code);
    next.push({ code, name });
    next.sort((a, b) => a.code.localeCompare(b.code));

    try {
      await updateCompanySettings({ branchesRaw: serializeBranchesRaw(next) }, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(`/gestor?tab=sucursales&branchCode=${encodeURIComponent(code)}&ok=${encodeURIComponent("Sucursal guardada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando sucursal";
      redirect(`/gestor?tab=sucursales&branchCodeDraft=${encodeURIComponent(code)}&branchNameDraft=${encodeURIComponent(name)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteBranchAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=sucursales&error=Permiso+denegado");

    const code = String(formData.get("branchCode") ?? "").trim().toUpperCase();
    if (!code) {
      redirect("/gestor?tab=sucursales&error=Debes+indicar+la+sucursal+a+eliminar");
    }

    const current = await getCompanySettings();
    const next = current.branches.filter((item) => item.code !== code);
    if (next.length === current.branches.length) {
      redirect("/gestor?tab=sucursales&error=Sucursal+no+encontrada");
    }

    try {
      await updateCompanySettings({ branchesRaw: serializeBranchesRaw(next) }, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      const nextCode = next[0]?.code ?? "";
      redirect(`/gestor?tab=sucursales${nextCode ? `&branchCode=${encodeURIComponent(nextCode)}` : ""}&ok=${encodeURIComponent("Sucursal eliminada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error eliminando sucursal";
      redirect(`/gestor?tab=sucursales&branchCode=${encodeURIComponent(code)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function saveBranchScheduleAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=sucursales&error=Permiso+denegado");

    const branchCode = String(formData.get("branchCode") ?? "").trim().toUpperCase();
    if (!branchCode) {
      redirect("/gestor?tab=sucursales&branchView=horarios&error=Selecciona+una+sucursal");
    }

    const current = await getCompanySettings();
    const base = current.branchSchedules?.[branchCode] ?? defaultBranchSchedule(actor.id);
    const weekly = { ...base.weekly };
    for (const day of WEEKLY_DAY_FIELDS) {
      const previous = base.weekly[day.key];
      weekly[day.key] = {
        enabled: formData.get(`${day.key}_enabled`) === "on",
        start1: normalizeTime(String(formData.get(`${day.key}_start1`) ?? previous.start1), previous.start1),
        end1: normalizeTime(String(formData.get(`${day.key}_end1`) ?? previous.end1), previous.end1),
        start2: normalizeTime(String(formData.get(`${day.key}_start2`) ?? previous.start2), previous.start2),
        end2: normalizeTime(String(formData.get(`${day.key}_end2`) ?? previous.end2), previous.end2),
      };
    }

    const exceptionDates = formData.getAll("exceptionDate").map((value) => String(value ?? "").trim());
    const exceptionModes = formData.getAll("exceptionMode").map((value) => String(value ?? "").trim().toUpperCase());
    const exceptionStart1 = formData.getAll("exceptionStart1").map((value) => String(value ?? "").trim());
    const exceptionEnd1 = formData.getAll("exceptionEnd1").map((value) => String(value ?? "").trim());
    const exceptionStart2 = formData.getAll("exceptionStart2").map((value) => String(value ?? "").trim());
    const exceptionEnd2 = formData.getAll("exceptionEnd2").map((value) => String(value ?? "").trim());
    const exceptionNote = formData.getAll("exceptionNote").map((value) => String(value ?? "").trim());

    const maxRows = Math.max(
      exceptionDates.length,
      exceptionModes.length,
      exceptionStart1.length,
      exceptionEnd1.length,
      exceptionStart2.length,
      exceptionEnd2.length,
      exceptionNote.length,
    );

    const exceptions = Array.from({ length: maxRows })
      .map((_, index) => {
        const date = exceptionDates[index] ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        const mode = exceptionModes[index] === "CERRADA" ? "CERRADA" : "ABIERTA";
        return {
          date,
          mode,
          start1: normalizeTime(exceptionStart1[index] ?? "08:00", "08:00"),
          end1: normalizeTime(exceptionEnd1[index] ?? "13:00", "13:00"),
          start2: normalizeTime(exceptionStart2[index] ?? "16:00", "16:00"),
          end2: normalizeTime(exceptionEnd2[index] ?? "20:00", "20:00"),
          note: exceptionNote[index] ?? "",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .toSorted((a, b) => a.date.localeCompare(b.date));

    const nextSchedules = {
      ...(current.branchSchedules ?? {}),
      [branchCode]: {
        periodLabel: String(formData.get("periodLabel") ?? base.periodLabel).trim() || base.periodLabel,
        timezone: String(formData.get("timezone") ?? base.timezone).trim() || base.timezone,
        language: String(formData.get("language") ?? base.language).trim() || base.language,
        weekly,
        exceptions,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id,
      },
    };

    try {
      await updateCompanySettings({ branchSchedulesRaw: JSON.stringify(nextSchedules) }, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      redirect(
        `/gestor?tab=sucursales&branchCode=${encodeURIComponent(branchCode)}&branchView=horarios&ok=${encodeURIComponent("Horarios guardados")}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando horarios";
      redirect(
        `/gestor?tab=sucursales&branchCode=${encodeURIComponent(branchCode)}&branchView=horarios&error=${encodeURIComponent(message)}`,
      );
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

  async function importTariffCsvAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=tarifas&error=Permiso+denegado");
    const csvFile = formData.get("tariffCsvFile");
    if (!(csvFile instanceof File) || csvFile.size === 0) {
      redirect("/gestor?tab=tarifas&error=Debes+adjuntar+un+CSV");
    }
    if (csvFile.size > 4 * 1024 * 1024) {
      redirect("/gestor?tab=tarifas&error=CSV+demasiado+grande+(max+4MB)");
    }
    try {
      const csvRaw = Buffer.from(await csvFile.arrayBuffer()).toString("utf8");
      const result = await importTariffCatalogFromCsv(csvRaw, { id: actor.id, role: actor.role });
      revalidatePath("/gestor");
      revalidatePath("/tarifas");
      redirect(
        `/gestor?tab=tarifas&ok=${encodeURIComponent(
          `Importación OK: filas ${result.rows}, planes +${result.plansCreated}/${result.plansUpdated} act., tramos +${result.bracketsCreated}/${result.bracketsUpdated} act., precios +${result.pricesCreated}/${result.pricesUpdated} act.`,
        )}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error importando tarifas";
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

  async function createTemplatePresetAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/gestor?tab=plantillas&error=Permiso+denegado");
    const templateCode = String(formData.get("templateCode") ?? "").trim();
    const templateType = String(formData.get("templateType") ?? "CONFIRMACION_RESERVA").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();
    const title = String(formData.get("title") ?? "").trim();
    try {
      await createTemplate(
        {
          templateCode,
          templateType,
          language,
          title,
          htmlContent: getTemplatePresetHtml(
            templateType as "CONTRATO" | "CONFIRMACION_RESERVA" | "FACTURA",
            language,
          ),
        },
        { id: actor.id, role: actor.role },
      );
      revalidatePath("/gestor");
      revalidatePath("/plantillas");
      redirect(`/gestor?tab=plantillas&qTemplate=${encodeURIComponent(qTemplate)}&ok=Plantilla+base+creada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando plantilla base";
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
  const helpByTab: Record<GestorTab, string[]> = {
    usuarios: ["Crea usuarios por rol.", "Activa/desactiva cuentas.", "Audita cambios críticos."],
    sucursales: ["Configura datos generales.", "Define horarios y excepciones.", "Guarda cambios."],
    tarifas: ["Ajusta tramos y matriz.", "Valida importes.", "Publica tarifa activa."],
    gastos: ["Consulta diario contable.", "Filtra por fecha/vehículo.", "Corrige incidencias."],
    plantillas: ["Edita plantillas.", "Comprueba resultado.", "Publica versión final."],
    backups: ["Genera backup.", "Revisa histórico.", "Restaura con doble confirmación."],
  };

  return (
    <div className="stack-lg">
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p>{params.ok}</p> : null}

      <section className="card stack-sm">
        <div className="table-header-row tab-nav-grid">
          <a className={tab === "usuarios" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=usuarios">Usuarios</a>
          <a className={tab === "sucursales" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=sucursales">Sucursales</a>
          <a className={tab === "tarifas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=tarifas">Tarifas</a>
          <a className={tab === "gastos" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=gastos">Gastos</a>
          <a className={tab === "plantillas" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=plantillas">Plantillas</a>
          <a className={tab === "backups" ? "primary-btn text-center" : "secondary-btn text-center"} href="/gestor?tab=backups">Backups</a>
        </div>
      </section>
      <ModuleHelp title="Ayuda rápida de Gestor" steps={helpByTab[tab]} />

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
        <section className={`card ${styles.branchControl}`}>
          <div className={styles.branchSidebar}>
            <div className={styles.branchSidebarHeader}>
              <h3>Control de sucursales</h3>
              <a className="secondary-btn text-center" href="/gestor?tab=sucursales&branchCodeDraft=&branchNameDraft=">Nueva</a>
            </div>
            <nav className={styles.branchTree} aria-label="Listado de sucursales">
              {settings.branches.length === 0 ? (
                <p className="muted-text">Sin sucursales configuradas.</p>
              ) : (
                settings.branches.map((branchItem) => {
                  const active = selectedBranchCode === branchItem.code;
                  return (
                    <a
                      key={branchItem.code}
                      href={`/gestor?tab=sucursales&branchCode=${encodeURIComponent(branchItem.code)}`}
                      className={active ? styles.branchTreeItemActive : styles.branchTreeItem}
                    >
                      <span>{branchItem.code}</span>
                      <strong>{branchItem.name}</strong>
                    </a>
                  );
                })
              )}
            </nav>
          </div>

          <div className={styles.branchEditor}>
            <div className={styles.branchTabs}>
              <a
                href={`/gestor?tab=sucursales${selectedBranchCode ? `&branchCode=${encodeURIComponent(selectedBranchCode)}` : ""}&branchView=general`}
                className={branchView === "general" ? styles.branchTabActive : styles.branchTabInactive}
              >
                General
              </a>
              <a
                href={`/gestor?tab=sucursales${selectedBranchCode ? `&branchCode=${encodeURIComponent(selectedBranchCode)}` : ""}&branchView=horarios`}
                className={branchView === "horarios" ? styles.branchTabActive : styles.branchTabInactive}
              >
                Horarios
              </a>
            </div>

            {branchView === "general" ? (
              <>
                <form action={upsertBranchAction} className={styles.branchForm}>
                  <label>
                    Código
                    <input
                      name="branchCode"
                      defaultValue={draftBranchCode}
                      placeholder="ALC"
                      maxLength={8}
                      required
                    />
                  </label>
                  <label className={styles.branchFormWide}>
                    Nombre de sucursal
                    <input
                      name="branchName"
                      defaultValue={draftBranchName}
                      placeholder="OFICINA PRINCIPAL LA MANGA"
                      required
                    />
                  </label>
                  <div className={styles.branchActions}>
                    <button className="primary-btn" type="submit">Guardar sucursal</button>
                  </div>
                </form>
                {selectedBranch ? (
                  <form action={deleteBranchAction} className={styles.branchDeleteForm}>
                    <input type="hidden" name="branchCode" value={selectedBranch.code} />
                    <button className="secondary-btn" type="submit">Baja sucursal</button>
                  </form>
                ) : null}

                <p className="muted-text">
                  Este sistema actualmente guarda sucursales con dos campos: código y nombre.
                </p>

                <details>
                  <summary>Edición masiva (CODIGO|NOMBRE)</summary>
                  <form action={saveCompanySettingsAction} className="stack-sm" style={{ marginTop: "0.5rem" }}>
                    <textarea
                      name="branchesRaw"
                      rows={7}
                      defaultValue={settings.branches.map((branch) => `${branch.code}|${branch.name}`).join("\n")}
                    />
                    <button className="secondary-btn" type="submit">Guardar listado completo</button>
                  </form>
                </details>
              </>
            ) : (
              <>
                {selectedBranch ? (
                  <form action={saveBranchScheduleAction} className={styles.branchScheduleForm}>
                    <input type="hidden" name="branchCode" value={selectedBranch.code} />
                    <div className={styles.branchScheduleMeta}>
                      <label>
                        Período
                        <select name="periodLabel" defaultValue={selectedBranchSchedule.periodLabel}>
                          {PERIOD_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                          {!PERIOD_OPTIONS.includes(selectedBranchSchedule.periodLabel as (typeof PERIOD_OPTIONS)[number]) ? (
                            <option value={selectedBranchSchedule.periodLabel}>{selectedBranchSchedule.periodLabel}</option>
                          ) : null}
                        </select>
                      </label>
                      <label>
                        Zona horaria
                        <select name="timezone" defaultValue={selectedBranchSchedule.timezone}>
                          <option value="Europe/Madrid">Europe/Madrid</option>
                          <option value="Europe/Lisbon">Europe/Lisbon</option>
                          <option value="Atlantic/Canary">Atlantic/Canary</option>
                          <option value="UTC">UTC</option>
                        </select>
                      </label>
                      <label>
                        Idioma
                        <select name="language" defaultValue={selectedBranchSchedule.language}>
                          <option value="es">Español</option>
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                          <option value="de">Deutsch</option>
                        </select>
                      </label>
                    </div>
                    <div className="table-wrap">
                      <table className={styles.branchScheduleTable}>
                        <thead>
                          <tr>
                            <th>Día</th>
                            <th>Activo</th>
                            <th>Mañana inicio</th>
                            <th>Mañana fin</th>
                            <th>Tarde inicio</th>
                            <th>Tarde fin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {WEEKLY_DAY_FIELDS.map((day) => {
                            const row = selectedBranchSchedule.weekly[day.key];
                            return (
                              <tr key={day.key}>
                                <td>{day.label}</td>
                                <td><input type="checkbox" name={`${day.key}_enabled`} defaultChecked={row.enabled} /></td>
                                <td><input type="time" name={`${day.key}_start1`} defaultValue={row.start1} /></td>
                                <td><input type="time" name={`${day.key}_end1`} defaultValue={row.end1} /></td>
                                <td><input type="time" name={`${day.key}_start2`} defaultValue={row.start2} /></td>
                                <td><input type="time" name={`${day.key}_end2`} defaultValue={row.end2} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="stack-sm">
                      <h4>Excepciones por calendario</h4>
                      <div className="table-wrap">
                        <table className={styles.branchScheduleTable}>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Modo</th>
                              <th>Inicio mañana</th>
                              <th>Fin mañana</th>
                              <th>Inicio tarde</th>
                              <th>Fin tarde</th>
                              <th>Nota</th>
                            </tr>
                          </thead>
                          <tbody>
                            {exceptionRows.map((row, index) => (
                              <tr key={`exception-${index}`}>
                                <td><input type="date" name="exceptionDate" defaultValue={row.date} /></td>
                                <td>
                                  <select name="exceptionMode" defaultValue={row.mode}>
                                    <option value="ABIERTA">Abierta</option>
                                    <option value="CERRADA">Cerrada</option>
                                  </select>
                                </td>
                                <td><input type="time" name="exceptionStart1" defaultValue={row.start1} /></td>
                                <td><input type="time" name="exceptionEnd1" defaultValue={row.end1} /></td>
                                <td><input type="time" name="exceptionStart2" defaultValue={row.start2} /></td>
                                <td><input type="time" name="exceptionEnd2" defaultValue={row.end2} /></td>
                                <td><input name="exceptionNote" defaultValue={row.note} placeholder="Opcional" /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className={styles.branchActions}>
                      <button className="primary-btn" type="submit">Guardar horarios</button>
                    </div>
                  </form>
                ) : (
                  <p className="muted-text">Selecciona o crea una sucursal para configurar sus horarios.</p>
                )}
              </>
            )}
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

          <section className="card stack-sm">
            <h3>Importar tarifas (CSV estándar)</h3>
            <form action={importTariffCsvAction} className="inline-search import-compact">
              <input name="tariffCsvFile" type="file" accept=".csv,text/csv" required />
              <button className="secondary-btn" type="submit">Importar CSV</button>
            </form>
          </section>
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
          <section className="card stack-sm">
            <div className="table-header-row">
              <a className="primary-btn text-center" href="/plantillas?mode=new">Nueva plantilla</a>
              <a className="secondary-btn text-center" href="/plantillas">Abrir gestor de plantillas</a>
            </div>
          </section>

          <section className="card stack-sm">
            <h3>Plantillas en uso</h3>
            {templatesInUse.length === 0 ? (
              <p className="muted-text">No hay plantillas activas.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Tipo</th>
                      <th>Idioma</th>
                      <th>Título</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templatesInUse.map((template) => (
                      <tr key={template.id}>
                        <td>{template.templateCode}</td>
                        <td>{template.templateType}</td>
                        <td>{template.language.toUpperCase()}</td>
                        <td>{template.title}</td>
                        <td>
                          <a
                            className="secondary-btn text-center"
                            href={`/plantillas?code=${encodeURIComponent(template.templateCode)}&language=${encodeURIComponent(template.language)}`}
                          >
                            Modificar
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
