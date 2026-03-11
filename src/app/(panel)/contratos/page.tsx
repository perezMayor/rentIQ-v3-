// Página del módulo contratos.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSelectedBranchId, getSessionUser } from "@/lib/auth";
import { formatDateTimeDisplay, formatMoneyDisplay } from "@/lib/formatting";
import {
  addInternalExpense,
  changeContractVehicle,
  closeContract,
  createContractFromScratch,
  deleteContract,
  getCompanySettings,
  getContractByNumber,
  getContractDetails,
  listContractAudit,
  listContracts,
  listClients,
  listFleetVehicles,
  listVehicleCategories,
  listTariffCatalog,
  listVehicleExtras,
  listTariffPlans,
  listReservations,
  registerContractCash,
  registerContractCheckIn,
  registerContractCheckOut,
  renumberContract,
  updateContract,
} from "@/lib/services/rental-service";
import styles from "./contratos.module.css";
import { ContractCreateForm } from "@/app/(panel)/contratos/contract-create-form";
import { ModuleHelp } from "@/components/module-help";
import { withActionLock } from "@/lib/action-lock";
import { getActionErrorMessage } from "@/lib/action-errors";

type ContractsTab = "gestion" | "historico" | "localizar" | "cambio" | "renumerar" | "asignacion" | "informes";

type Props = {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    error?: string;
    ok?: string;
    contractNumber?: string;
    contractId?: string;
    changeContractId?: string;
    assignContractId?: string;
    renumberContractId?: string;
    auditContractId?: string;
    from?: string;
    to?: string;
    status?: string;
    branch?: string;
    plate?: string;
    customer?: string;
    order?: string;
    dateField?: string;
    reportQ?: string;
    reportStatus?: string;
    reportBranch?: string;
    reportOrder?: string;
    reportDateField?: string;
  }>;
};

function normalizeTab(value: string): ContractsTab {
  if (value === "historico" || value === "localizar" || value === "cambio" || value === "renumerar" || value === "asignacion" || value === "informes") {
    return value;
  }
  return "gestion";
}

function allowedTabsByRole(role: string): ContractsTab[] {
  if (role === "LECTOR") {
    return ["gestion", "historico", "localizar", "informes"];
  }
  return ["gestion", "historico", "localizar", "cambio", "renumerar", "asignacion", "informes"];
}

function parseDateSafe(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function inRange(value: string, from: string, to: string) {
  const target = parseDateSafe(value);
  const start = parseDateSafe(from);
  const end = parseDateSafe(to);
  if (!target || !start || !end) return false;
  return target >= start && target <= end;
}

function defaultRange(days = 30) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.includes("T")) {
    return normalized.slice(0, 16);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}

export default async function ContratosPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const selectedBranchId = await getSelectedBranchId();

  const params = await searchParams;
  const requestedTab = normalizeTab((params.tab ?? "gestion").toLowerCase());
  const allowedTabs = allowedTabsByRole(user.role);
  const tab = allowedTabs.includes(requestedTab) ? requestedTab : allowedTabs[0];
  const canWrite = user.role !== "LECTOR";
  const range30 = defaultRange(30);

  const q = params.q ?? "";
  const from = params.from ?? range30.from;
  const to = params.to ?? range30.to;
  const status = (params.status ?? "TODOS").toUpperCase();
  const branch = params.branch ?? selectedBranchId;
  const plate = params.plate ?? "";
  const customer = params.customer ?? "";
  const order = (params.order ?? "DESC").toUpperCase();
  const dateField = (params.dateField ?? "CREACION").toUpperCase();
  const contractNumber = params.contractNumber ?? "";
  const contractId = params.contractId ?? "";
  const changeContractId = params.changeContractId ?? "";
  const assignContractId = params.assignContractId ?? "";
  const renumberContractId = params.renumberContractId ?? "";
  const auditContractId = params.auditContractId ?? "";
  const reportQ = params.reportQ ?? "";
  const reportStatus = (params.reportStatus ?? "TODOS").toUpperCase();
  const reportBranch = params.reportBranch ?? selectedBranchId;
  const reportOrder = (params.reportOrder ?? "DESC").toUpperCase();
  const reportDateField = (params.reportDateField ?? "CREACION").toUpperCase();

  const [contracts, reservations, fleet, settings, clients, tariffPlans, vehicleExtras, categories] = await Promise.all([
    listContracts(""),
    listReservations(""),
    listFleetVehicles(),
    getCompanySettings(),
    listClients("", "TODOS"),
    listTariffPlans(""),
    listVehicleExtras(),
    listVehicleCategories(),
  ]);
  const tariffCatalogs = await Promise.all(
    tariffPlans.map(async (plan) => {
      const catalog = await listTariffCatalog(plan.id);
      return {
        plan: {
          id: catalog.plan?.id ?? plan.id,
          code: catalog.plan?.code ?? plan.code,
          validFrom: catalog.plan?.validFrom ?? plan.validFrom,
          validTo: catalog.plan?.validTo ?? plan.validTo,
          updatedAt: catalog.plan?.updatedAt ?? plan.updatedAt,
          courtesyHours: catalog.plan?.courtesyHours ?? plan.courtesyHours,
        },
        brackets: catalog.brackets.map((item) => ({
          id: item.id,
          fromDay: item.fromDay,
          toDay: item.toDay,
          order: item.order,
          label: item.label,
        })),
        prices: catalog.prices.map((item) => ({
          bracketId: item.bracketId,
          groupCode: item.groupCode,
          price: item.price,
        })),
      };
    }),
  );

  const loadedContractByNumber = contractNumber ? await getContractByNumber(contractNumber) : null;
  const loadedContractById = contractId ? contracts.find((item) => item.id === contractId) ?? null : null;
  const loadedContract = loadedContractByNumber ?? loadedContractById;
  const loadedReservation = loadedContract
    ? reservations.find((reservation) => reservation.id === loadedContract.reservationId) ?? null
    : null;
  const loadedDetail = loadedContract ? await getContractDetails(loadedContract.id) : null;
  const loadedContractLocked = Boolean(loadedContract && (loadedContract.status === "CERRADO" || loadedDetail?.invoice));
  const auditItems = auditContractId ? await listContractAudit(auditContractId) : [];

  const historicalContracts = contracts
    .filter((contract) => {
      const dateValue = dateField === "ENTREGA" ? contract.deliveryAt : dateField === "RECOGIDA" ? contract.pickupAt : contract.createdAt;
      return inRange(dateValue, `${from}T00:00:00`, `${to}T23:59:59`);
    })
    .filter((contract) => (status === "TODOS" ? true : contract.status === status))
    .filter((contract) => (!branch ? true : contract.branchCode.toLowerCase().includes(branch.toLowerCase())))
    .filter((contract) => (!q ? true : [contract.contractNumber, contract.customerName, contract.companyName, contract.vehiclePlate].join(" ").toLowerCase().includes(q.toLowerCase())))
    .toSorted((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return order === "ASC" ? cmp : -cmp;
    });

  const locatedContracts = contracts
    .filter((contract) => (!contractNumber ? true : contract.contractNumber.toLowerCase().includes(contractNumber.toLowerCase())))
    .filter((contract) => (!plate ? true : contract.vehiclePlate.toLowerCase().includes(plate.toLowerCase())))
    .filter((contract) => (!customer ? true : [contract.customerName, contract.companyName].join(" ").toLowerCase().includes(customer.toLowerCase())))
    .filter((contract) => (!branch ? true : contract.branchCode.toLowerCase().includes(branch.toLowerCase())))
    .filter((contract) => (status === "TODOS" ? true : contract.status === status));

  const unassignedContracts = contracts
    .filter((contract) => contract.status === "ABIERTO" && !contract.vehiclePlate)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openContracts = contracts
    .filter((contract) => contract.status === "ABIERTO")
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedChangeContract = changeContractId
    ? openContracts.find((contract) => contract.id === changeContractId) ?? null
    : null;
  const selectedAssignContract = assignContractId
    ? unassignedContracts.find((contract) => contract.id === assignContractId) ?? null
    : null;
  const helpByTab: Record<ContractsTab, string[]> = {
    gestion: ["Crea o carga contrato.", "Verifica cliente, tramo y vehículo.", "Guarda y opera checkout/checkin."],
    historico: ["Filtra por rango.", "Abre contrato.", "Audita eventos."],
    localizar: ["Busca por contrato, cliente o matrícula.", "Abre gestión.", "Escala a cambio/renumeración."],
    cambio: ["Carga contrato abierto.", "Informa motivo y datos operativos.", "Confirma cambio."],
    renumerar: ["Carga contrato abierto.", "Indica sucursal destino.", "Confirma renumeración."],
    asignacion: ["Filtra sin matrícula.", "Asigna vehículo.", "Usa override solo con motivo."],
    informes: ["Define filtros.", "Valida resultados.", "Exporta CSV."],
  };
  const selectedRenumberContractById = renumberContractId
    ? openContracts.find((contract) => contract.id === renumberContractId) ?? null
    : null;
  const selectedRenumberContractByNumber = contractNumber
    ? openContracts.find((contract) => contract.contractNumber.toUpperCase() === contractNumber.toUpperCase()) ?? null
    : null;
  const selectedRenumberContract = selectedRenumberContractById ?? selectedRenumberContractByNumber;

  const reportContracts = contracts
    .filter((contract) => {
      const dateValue =
        reportDateField === "ENTREGA"
          ? contract.deliveryAt
          : reportDateField === "RECOGIDA"
            ? contract.pickupAt
            : contract.createdAt;
      return inRange(dateValue, `${from}T00:00:00`, `${to}T23:59:59`);
    })
    .filter((contract) => (reportStatus === "TODOS" ? true : contract.status === reportStatus))
    .filter((contract) => (!reportBranch ? true : contract.branchCode.toLowerCase().includes(reportBranch.toLowerCase())))
    .filter((contract) =>
      !reportQ
        ? true
        : [contract.contractNumber, contract.customerName, contract.companyName, contract.vehiclePlate, contract.branchCode]
            .join(" ")
            .toLowerCase()
            .includes(reportQ.toLowerCase()),
    )
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (reportOrder === "ASC") {
    reportContracts.reverse();
  }
  const reportTotal = reportContracts.reduce((sum, item) => sum + item.totalSettlement, 0);

  async function createContractFromScratchAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?tab=gestion&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      const lockKey = [
        "contract:create",
        actor.id,
        input.customerId ?? input.customerName ?? "",
        input.deliveryAt ?? "",
        input.pickupAt ?? "",
      ].join("|");
      const created = await withActionLock(lockKey, async () => createContractFromScratch(input, { id: actor.id, role: actor.role }));
      revalidatePath("/contratos");
      revalidatePath("/reservas");
      revalidatePath("/planning");
      redirect(`/contratos?tab=gestion&contractNumber=${encodeURIComponent(created.contractNumber)}&ok=${encodeURIComponent("Contrato generado")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al generar contrato");
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent(message)}`);
    }
  }

  async function registerCashAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const detail = await getContractDetails(contractId);
    if (!detail) {
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent("Contrato no encontrado")}`);
    }
    if (detail.invoice) {
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent("Contrato facturado: no se puede modificar.")}`,
      );
    }
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:cash:${actor.id}:${contractId}`, async () => {
        await registerContractCash(contractId, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&ok=${encodeURIComponent("Caja registrada")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al registrar caja");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function checkOutAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const detail = await getContractDetails(contractId);
    if (!detail) {
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent("Contrato no encontrado")}`);
    }
    if (detail.invoice) {
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent("Contrato facturado: no se puede modificar.")}`,
      );
    }
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:checkout:${actor.id}:${contractId}`, async () => {
        await registerContractCheckOut(contractId, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&ok=${encodeURIComponent("Checkout registrado")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error en checkout");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function checkInAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const detail = await getContractDetails(contractId);
    if (!detail) {
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent("Contrato no encontrado")}`);
    }
    if (detail.invoice) {
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent("Contrato facturado: no se puede modificar.")}`,
      );
    }
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:checkin:${actor.id}:${contractId}`, async () => {
        await registerContractCheckIn(contractId, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&ok=${encodeURIComponent("Checkin registrado")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error en checkin");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function closeContractAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const detail = await getContractDetails(contractId);
    if (!detail) {
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent("Contrato no encontrado")}`);
    }
    if (detail.invoice) {
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent("Contrato facturado: no se puede modificar.")}`,
      );
    }
    try {
      await withActionLock(`contract:close:${actor.id}:${contractId}`, async () => {
        await closeContract(contractId, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      revalidatePath("/facturacion");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&ok=${encodeURIComponent("Contrato cerrado")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al cerrar contrato");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function addExpenseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const detail = await getContractDetails(contractId);
    if (!detail) {
      redirect(`/contratos?tab=gestion&error=${encodeURIComponent("Contrato no encontrado")}`);
    }
    if (detail.invoice) {
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent("Contrato facturado: no se puede modificar.")}`,
      );
    }
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:expense:${actor.id}:${contractId}`, async () => {
        await addInternalExpense(contractId, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&ok=${encodeURIComponent("Gasto añadido")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al registrar gasto");
      redirect(
        `/contratos?tab=gestion&contractId=${encodeURIComponent(contractId)}&contractNumber=${encodeURIComponent(detail.contract.contractNumber)}&error=${encodeURIComponent(message)}`,
      );
    }
  }

  async function updateContractAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    try {
      const input = Object.fromEntries(formData.entries()) as Record<string, string>;
      await withActionLock(`contract:update:${actor.id}:${contractId}`, async () => {
        await updateContract(contractId, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(`/contratos?tab=historico&ok=${encodeURIComponent("Contrato actualizado")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al actualizar");
      redirect(`/contratos?tab=historico&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteContractAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    try {
      await withActionLock(`contract:delete:${actor.id}:${contractId}`, async () => {
        await deleteContract(contractId, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      revalidatePath("/reservas");
      redirect(`/contratos?tab=historico&ok=${encodeURIComponent("Contrato borrado")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al borrar");
      redirect(`/contratos?tab=historico&error=${encodeURIComponent(message)}`);
    }
  }

  async function changeVehicleByNumberAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?tab=cambio&error=Permiso+denegado");

    const contractIdInput = String(formData.get("contractId") ?? "").trim();
    const contractNumberInput = String(formData.get("contractNumber") ?? "").trim();
    const contract = contractIdInput
      ? contracts.find((item) => item.id === contractIdInput) ?? null
      : await getContractByNumber(contractNumberInput);
    if (!contract) {
      redirect(`/contratos?tab=cambio&error=${encodeURIComponent("Contrato no encontrado")}`);
    }

    const changeAt = String(formData.get("changeAt") ?? "").trim();
    if (changeAt) {
      const changeDate = parseDateSafe(changeAt);
      const delivery = parseDateSafe(contract.deliveryAt);
      const beforeDelivery = Boolean(changeDate && delivery && changeDate < delivery);
      if (beforeDelivery) {
        redirect(`/contratos?tab=cambio&error=${encodeURIComponent("Alarma: la fecha/hora de cambio es anterior a la entrega del contrato.")}`);
      }
    }

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:vehicle-change:${actor.id}:${contract.id}`, async () => {
        await changeContractVehicle(contract.id, {
          vehiclePlate: input.vehiclePlate,
          overrideAccepted: input.overrideAccepted,
          overrideReason: input.overrideReason,
          changeAt: input.changeAt,
          changeReason: input.changeReason,
          kmOut: input.kmOut,
          kmIn: input.kmIn,
          fuelOut: input.fuelOut,
          fuelIn: input.fuelIn,
          notes: input.notes,
        }, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      revalidatePath("/reservas");
      revalidatePath("/planning");
      redirect(`/contratos?tab=cambio&changeContractId=${encodeURIComponent(contract.id)}&ok=${encodeURIComponent("Vehículo cambiado")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al cambiar vehículo");
      redirect(`/contratos?tab=cambio&changeContractId=${encodeURIComponent(contract.id)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function renumberAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?tab=renumerar&error=Permiso+denegado");

    const contractIdInput = String(formData.get("contractId") ?? "").trim();
    const contractNumberInput = String(formData.get("contractNumber") ?? "").trim();
    const contract = contractIdInput
      ? contracts.find((item) => item.id === contractIdInput) ?? null
      : await getContractByNumber(contractNumberInput);
    if (!contract) {
      redirect(`/contratos?tab=renumerar&error=${encodeURIComponent("Contrato no encontrado")}`);
    }

    try {
      const input = Object.fromEntries(formData.entries()) as Record<string, string>;
      const updated = await withActionLock(`contract:renumber:${actor.id}:${contract.id}`, async () => {
        return renumberContract(contract.id, input, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      redirect(
        `/contratos?tab=renumerar&contractNumber=${encodeURIComponent(updated.contractNumber)}&renumberContractId=${encodeURIComponent(updated.id)}&ok=${encodeURIComponent("Contrato renumerado")}`,
      );
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al renumerar");
      redirect(`/contratos?tab=renumerar&renumberContractId=${encodeURIComponent(contract.id)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function assignPlateToContractAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/contratos?tab=asignacion&error=Permiso+denegado");
    const contractId = String(formData.get("contractId") ?? "");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await withActionLock(`contract:assign-plate:${actor.id}:${contractId}`, async () => {
        await changeContractVehicle(contractId, {
          vehiclePlate: input.vehiclePlate,
          overrideAccepted: input.overrideAccepted,
          overrideReason: input.overrideReason,
          changeReason: "ASIGNACION_MANUAL_CONTRATO",
        }, { id: actor.id, role: actor.role });
      });
      revalidatePath("/contratos");
      revalidatePath("/reservas");
      revalidatePath("/planning");
      redirect(`/contratos?tab=asignacion&assignContractId=${encodeURIComponent(contractId)}&ok=${encodeURIComponent("Matrícula asignada")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al asignar matrícula");
      redirect(`/contratos?tab=asignacion&assignContractId=${encodeURIComponent(contractId)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className={`stack-lg ${styles.contractsRoot}`}>
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p className="success-text">{params.ok}</p> : null}

      <section className="card stack-sm">
        <div className="table-header-row tab-nav-grid">
          <a className={tab === "gestion" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=gestion">Gestión de contrato</a>
          <a className={tab === "historico" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=historico">Histórico</a>
          <a className={tab === "localizar" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=localizar">Localizar contrato</a>
          {allowedTabs.includes("cambio") ? <a className={tab === "cambio" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=cambio">Cambio de vehículo</a> : null}
          {allowedTabs.includes("renumerar") ? <a className={tab === "renumerar" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=renumerar">Renumerar</a> : null}
          {allowedTabs.includes("asignacion") ? <a className={tab === "asignacion" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=asignacion">Asignación matrículas</a> : null}
          <a className={tab === "informes" ? "primary-btn text-center" : "secondary-btn text-center"} href="/contratos?tab=informes">Informes de contratos</a>
        </div>
      </section>
      <ModuleHelp title="Ayuda rápida de Contratos" steps={helpByTab[tab]} />

      {tab === "gestion" ? (
        <>
          <section className="card stack-sm">
            {loadedContractLocked ? <p className="danger-text">Contrato facturado: formulario en solo lectura.</p> : null}
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="gestion" />
              <input name="contractNumber" defaultValue={contractNumber} placeholder="Introducir nº contrato" />
              <button className="secondary-btn" type="submit">Cargar contrato</button>
            </form>
            {canWrite ? (
              <ContractCreateForm
                key={loadedContract?.id ?? "contract-create-new"}
                action={createContractFromScratchAction}
                canWrite={canWrite && !loadedContractLocked}
                vehicles={fleet.map((vehicle) => ({
                  plate: vehicle.plate,
                  groupLabel: vehicle.categoryLabel.split(" - ")[0] || vehicle.categoryLabel,
                  activeUntil: vehicle.activeUntil ?? "",
                }))}
                reservations={reservations.map((reservation) => ({
                  assignedPlate: reservation.assignedPlate,
                  deliveryAt: reservation.deliveryAt,
                  pickupAt: reservation.pickupAt,
                }))}
                contracts={contracts
                  .filter((item) => item.id !== loadedContract?.id)
                  .map((item) => ({
                    vehiclePlate: item.vehiclePlate,
                    deliveryAt: item.deliveryAt,
                    pickupAt: item.pickupAt,
                  }))}
                tariffOptions={tariffPlans.map((plan) => ({ id: plan.id, code: plan.code, title: plan.title }))}
                tariffCatalogs={tariffCatalogs}
                salesChannels={settings.salesChannels ?? []}
                branches={settings.branches ?? []}
                defaultBranchCode={settings.branches.some((branch) => branch.code === selectedBranchId) ? selectedBranchId : (settings.branches[0]?.code ?? "")}
                courtesyHours={settings.courtesyHours ?? 0}
                allGroups={categories.map((category) => category.code || category.name).filter(Boolean)}
                insuranceOptions={vehicleExtras.filter((item) => item.active && item.kind === "SEGURO")}
                initialValues={
                  loadedContract
                    ? {
                        lookup: loadedContract.customerName || "",
                        customerId: loadedReservation?.customerId ?? "",
                        customerName: loadedContract.customerName || "",
                        customerCompany: loadedContract.companyName || "",
                        branchDelivery: loadedReservation?.branchDelivery || loadedContract.branchCode || "",
                        deliveryPlace: loadedReservation?.deliveryPlace || "",
                        deliveryAt: toDateTimeLocal(loadedContract.deliveryAt),
                        pickupBranch: loadedReservation?.pickupBranch || loadedContract.branchCode || "",
                        pickupPlace: loadedReservation?.pickupPlace || "",
                        pickupAt: toDateTimeLocal(loadedContract.pickupAt),
                        billedCarGroup: loadedContract.billedCarGroup || "",
                        assignedVehicleGroup:
                          fleet.find((vehicle) => vehicle.plate.toUpperCase() === loadedContract.vehiclePlate.toUpperCase())?.categoryLabel.split(" - ")[0] || "",
                        assignedPlate: loadedContract.vehiclePlate || "",
                        appliedRate: loadedContract.appliedRate || loadedReservation?.appliedRate || "",
                        salesChannel: loadedReservation?.salesChannel || "",
                        totalPrice: String(loadedContract.totalSettlement || loadedReservation?.totalPrice || ""),
                        customerCommissioner: loadedReservation?.customerCommissioner || "",
                        billedDays: String(loadedReservation?.billedDays || 1),
                        ivaPercent: String(loadedContract.ivaPercent || loadedReservation?.ivaPercent || 21),
                        deductible: loadedContract.deductible || loadedReservation?.deductible || "",
                        depositAmount: String(loadedReservation?.depositAmount || 0),
                        paymentsMade: String(loadedContract.paymentsMade || loadedReservation?.paymentsMade || 0),
                        baseAmount: String(loadedContract.baseAmount || loadedReservation?.baseAmount || 0),
                        discountAmount: String(loadedContract.discountAmount || loadedReservation?.discountAmount || 0),
                        discountBreakdown: loadedContract.discountBreakdown || loadedReservation?.discountBreakdown || "",
                        extrasAmount: String(loadedContract.extrasAmount || loadedReservation?.extrasAmount || 0),
                        fuelAmount: String(loadedContract.fuelAmount || loadedReservation?.fuelAmount || 0),
                        insuranceAmount: String(loadedContract.insuranceAmount || loadedReservation?.insuranceAmount || 0),
                        penaltiesAmount: String(loadedContract.penaltiesAmount || loadedReservation?.penaltiesAmount || 0),
                        extrasBreakdown: loadedReservation?.extrasBreakdown || "",
                        additionalDrivers: loadedReservation?.additionalDrivers || "",
                        publicNotes: loadedReservation?.publicNotes || "",
                        privateNotes: loadedReservation?.privateNotes || "",
                      }
                    : undefined
                }
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
                extraOptions={vehicleExtras.filter((item) => item.active)}
              />
            ) : null}
          </section>

          {loadedContract ? (
            <section className="card stack-sm">
              <div className="table-header-row">
                <h3>{loadedContract.contractNumber}</h3>
                <a className="primary-btn text-center" href={`/api/contratos/${loadedContract.id}/pdf`} download>Imprimir contrato</a>
              </div>
              <p className="muted-text">{loadedContract.customerName} | {loadedContract.vehiclePlate || "Sin matrícula"} | {loadedContract.deliveryAt} → {loadedContract.pickupAt}</p>
              {loadedDetail?.invoice ? (
                <p className="danger-text">
                  Contrato facturado ({loadedDetail.invoice.invoiceNumber}). No se puede modificar.
                </p>
              ) : null}

              <details>
                <summary>Caja</summary>
                <form action={registerCashAction} className="mini-form" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="contractId" value={loadedContract.id} />
                  <input name="amount" type="number" step="0.01" placeholder="Importe" disabled={!canWrite || loadedContractLocked} />
                  <select name="method" defaultValue="EFECTIVO" disabled={!canWrite || loadedContractLocked}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <input name="cardLast4" maxLength={4} placeholder="Últimos 4" disabled={!canWrite || loadedContractLocked} />
                  <input name="notes" placeholder="Notas" disabled={!canWrite || loadedContractLocked} />
                  <button className="secondary-btn" type="submit" disabled={!canWrite || loadedContractLocked}>Guardar caja</button>
                </form>
              </details>

              <details>
                <summary>Checkout / Checkin</summary>
                <form action={checkOutAction} className="mini-form" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="contractId" value={loadedContract.id} />
                  <input name="km" type="number" step="1" placeholder="KM salida" disabled={!canWrite || loadedContractLocked} />
                  <input name="fuelLevel" placeholder="Combustible salida" disabled={!canWrite || loadedContractLocked} />
                  <input name="notes" placeholder="Notas salida" disabled={!canWrite || loadedContractLocked} />
                  <input name="signerName" placeholder="Firmante salida" disabled={!canWrite || loadedContractLocked} />
                  <input name="signatureDevice" placeholder="Dispositivo firma (tablet/web)" disabled={!canWrite || loadedContractLocked} />
                  <button className="secondary-btn" type="submit" disabled={!canWrite || loadedContractLocked}>Guardar checkout</button>
                </form>
                <form action={checkInAction} className="mini-form" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="contractId" value={loadedContract.id} />
                  <input name="km" type="number" step="1" placeholder="KM llegada" disabled={!canWrite || loadedContractLocked} />
                  <input name="fuelLevel" placeholder="Combustible llegada" disabled={!canWrite || loadedContractLocked} />
                  <input name="notes" placeholder="Notas llegada" disabled={!canWrite || loadedContractLocked} />
                  <input name="signerName" placeholder="Firmante llegada" disabled={!canWrite || loadedContractLocked} />
                  <input name="signatureDevice" placeholder="Dispositivo firma (tablet/web)" disabled={!canWrite || loadedContractLocked} />
                  <button className="secondary-btn" type="submit" disabled={!canWrite || loadedContractLocked}>Guardar checkin</button>
                </form>
              </details>

              <details>
                <summary>Gastos internos</summary>
                <form action={addExpenseAction} className="mini-form" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="contractId" value={loadedContract.id} />
                  <select name="category" defaultValue="PEAJE" disabled={!canWrite || loadedContractLocked}>
                    <option value="PEAJE">Peaje</option>
                    <option value="GASOLINA">Gasolina</option>
                    <option value="COMIDA">Comida</option>
                    <option value="PARKING">Parking</option>
                    <option value="LAVADO">Lavado</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <input name="amount" type="number" step="0.01" placeholder="Importe" disabled={!canWrite || loadedContractLocked} />
                  <input name="vehiclePlate" placeholder="Matrícula" defaultValue={loadedContract.vehiclePlate} disabled={!canWrite || loadedContractLocked} />
                  <input name="expenseDate" type="date" disabled={!canWrite || loadedContractLocked} />
                  <input name="note" placeholder="Nota" disabled={!canWrite || loadedContractLocked} />
                  <button className="secondary-btn" type="submit" disabled={!canWrite || loadedContractLocked}>Añadir gasto</button>
                </form>
              </details>

              <details open>
                <summary>Cerrar contrato</summary>
                <form action={closeContractAction} className="mini-form" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="contractId" value={loadedContract.id} />
                  <p className="muted-text">Sin caja hecha no se puede cerrar.</p>
                  <button className="primary-btn" type="submit" disabled={!canWrite || loadedContractLocked || !loadedContract.cashRecord}>Cerrar contrato</button>
                  <p className="muted-text">Factura: {loadedDetail?.invoice?.invoiceNumber || "Sin factura"}</p>
                </form>
              </details>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "historico" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <a className="secondary-btn text-center" href="/api/contratos/preimpresion">Preimpresión contrato</a>
          </div>
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="historico" />
            <input name="q" defaultValue={q} placeholder="Buscar" />
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <select name="status" defaultValue={status}>
              <option value="TODOS">Estado: todos</option>
              <option value="ABIERTO">Abierto</option>
              <option value="CERRADO">Cerrado</option>
            </select>
            <input name="branch" defaultValue={branch} placeholder="Sucursal" />
            <select name="dateField" defaultValue={dateField}>
              <option value="CREACION">Fecha creación</option>
              <option value="ENTREGA">Fecha entrega</option>
              <option value="RECOGIDA">Fecha recogida</option>
            </select>
            <select name="order" defaultValue={order}>
              <option value="DESC">Descendente</option>
              <option value="ASC">Ascendente</option>
            </select>
            <button className="secondary-btn" type="submit">Filtrar</button>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Matrícula</th>
                  <th>Entrega</th>
                  <th>Recogida</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historicalContracts.length === 0 ? (
                  <tr><td colSpan={9} className="muted-text">Sin contratos en rango.</td></tr>
                ) : (
                  historicalContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.contractNumber}</td>
                      <td>{contract.customerName}</td>
                      <td>{contract.branchCode}</td>
                      <td>{contract.vehiclePlate || "N/D"}</td>
                      <td>{formatDateTimeDisplay(contract.deliveryAt)}</td>
                      <td>{formatDateTimeDisplay(contract.pickupAt)}</td>
                      <td>{contract.status}</td>
                      <td>{formatMoneyDisplay(contract.totalSettlement)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${contract.id}`}>Abrir</a>
                        <a className="primary-btn text-center" href={`/api/contratos/${contract.id}/pdf`} download>Imprimir</a>
                        <a className="secondary-btn text-center" href={`/contratos?tab=historico&from=${from}&to=${to}&q=${encodeURIComponent(q)}&auditContractId=${contract.id}`}>Auditoría</a>
                        {canWrite ? (
                          <details>
                            <summary>Editar / Borrar</summary>
                            <form action={updateContractAction} className="mini-form" style={{ marginTop: "0.5rem" }}>
                              <input type="hidden" name="contractId" value={contract.id} />
                              <input name="customerName" defaultValue={contract.customerName} placeholder="Cliente" disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)} />
                              <input name="deliveryAt" type="datetime-local" defaultValue={contract.deliveryAt.slice(0, 16)} disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)} />
                              <input name="pickupAt" type="datetime-local" defaultValue={contract.pickupAt.slice(0, 16)} disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)} />
                              <input name="billedCarGroup" defaultValue={contract.billedCarGroup} placeholder="Grupo" disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)} />
                              <input name="totalSettlement" type="number" step="0.01" defaultValue={contract.totalSettlement.toFixed(2)} disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)} />
                              <button className="secondary-btn" type="submit" disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)}>Guardar</button>
                            </form>
                            <form action={deleteContractAction} className="mini-form" style={{ marginTop: "0.5rem" }}>
                              <input type="hidden" name="contractId" value={contract.id} />
                              <button className="secondary-btn" type="submit" disabled={contract.status === "CERRADO" || Boolean(contract.invoiceId)}>
                                {contract.status === "CERRADO" || contract.invoiceId ? "No borrable" : "Borrar"}
                              </button>
                            </form>
                            {contract.invoiceId ? <p className="danger-text">Contrato facturado: sin edición.</p> : null}
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {auditContractId ? (
            <section className="card-muted stack-sm">
              <div className="table-header-row">
                <h4>Auditoría contrato</h4>
                <a className="secondary-btn text-center" href={`/contratos?tab=historico&from=${from}&to=${to}&q=${encodeURIComponent(q)}`}>Cerrar</a>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {auditItems.length === 0 ? (
                      <tr><td colSpan={4} className="muted-text">Sin eventos.</td></tr>
                    ) : (
                      auditItems.map((event, idx) => (
                        <tr key={`${event.timestamp}-${idx}`}>
                          <td>{formatDateTimeDisplay(event.timestamp)}</td>
                          <td>{event.action}</td>
                          <td>{event.actorId}</td>
                          <td><code>{JSON.stringify(event.details ?? {})}</code></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {tab === "localizar" ? (
        <section className="card stack-sm">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="localizar" />
            <input name="contractNumber" defaultValue={contractNumber} placeholder="Nº contrato" />
            <input name="plate" defaultValue={plate} placeholder="Matrícula" />
            <input name="customer" defaultValue={customer} placeholder="Cliente" />
            <input name="branch" defaultValue={branch} placeholder="Sucursal" />
            <select name="status" defaultValue={status}>
              <option value="TODOS">Todos</option>
              <option value="ABIERTO">Abierto</option>
              <option value="CERRADO">Cerrado</option>
            </select>
            <button className="secondary-btn" type="submit">Buscar</button>
          </form>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Contrato</th><th>Cliente</th><th>Matrícula</th><th>Sucursal</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>
                {locatedContracts.length === 0 ? (
                  <tr><td colSpan={7} className="muted-text">Sin resultados.</td></tr>
                ) : (
                  locatedContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.contractNumber}</td>
                      <td>{contract.customerName}</td>
                      <td>{contract.vehiclePlate || "N/D"}</td>
                      <td>{contract.branchCode}</td>
                      <td>{contract.status}</td>
                      <td>{formatMoneyDisplay(contract.totalSettlement)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${contract.id}&contractNumber=${encodeURIComponent(contract.contractNumber)}`}>Abrir gestión</a>
                        <a className="primary-btn text-center" href={`/api/contratos/${contract.id}/pdf`} download>Imprimir</a>
                        <a className="secondary-btn text-center" href={`/contratos?tab=historico&auditContractId=${contract.id}`}>Auditoría</a>
                        <a className="secondary-btn text-center" href={`/contratos?tab=cambio&changeContractId=${contract.id}`}>Cambio vehículo</a>
                        {contract.status === "ABIERTO" ? (
                          <a className="secondary-btn text-center" href={`/contratos?tab=renumerar&renumberContractId=${contract.id}`}>Renumerar</a>
                        ) : null}
                        {!contract.vehiclePlate && contract.status === "ABIERTO" ? (
                          <a className="secondary-btn text-center" href={`/contratos?tab=asignacion&assignContractId=${contract.id}`}>Asignar matrícula</a>
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

      {tab === "cambio" ? (
        <section className="card stack-sm">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="cambio" />
            <select name="changeContractId" defaultValue={selectedChangeContract?.id ?? ""}>
              <option value="">Selecciona contrato abierto</option>
              {openContracts.map((contract) => (
                <option key={`change-${contract.id}`} value={contract.id}>
                  {contract.contractNumber} | {contract.customerName} | {contract.vehiclePlate || "Sin matrícula"}
                </option>
              ))}
            </select>
            <button className="secondary-btn" type="submit">Cargar contrato</button>
          </form>
          {selectedChangeContract ? (
            <p className="muted-text">
              Contrato: {selectedChangeContract.contractNumber} | Matrícula actual: {selectedChangeContract.vehiclePlate || "N/D"} |
              Entrega: {formatDateTimeDisplay(selectedChangeContract.deliveryAt)}
            </p>
          ) : null}
          <form action={changeVehicleByNumberAction} className="mini-form">
            <input type="hidden" name="contractId" value={selectedChangeContract?.id ?? ""} />
            <input name="contractNumber" placeholder="Nº contrato (si no seleccionas arriba)" disabled={!canWrite} defaultValue={selectedChangeContract?.contractNumber ?? ""} />
            <input name="vehiclePlate" placeholder="Nueva matrícula" list="fleet-contract-change" disabled={!canWrite} />
            <datalist id="fleet-contract-change">
              {fleet.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.plate}>{vehicle.categoryLabel}</option>
              ))}
            </datalist>
            <input name="changeAt" type="datetime-local" disabled={!canWrite} />
            <input name="changeReason" placeholder="Motivo cambio" disabled={!canWrite} />
            <input name="kmOut" type="number" step="1" placeholder="KM vehículo salida" disabled={!canWrite} />
            <input name="fuelOut" placeholder="Combustible salida" disabled={!canWrite} />
            <input name="kmIn" type="number" step="1" placeholder="KM vehículo entrada" disabled={!canWrite} />
            <input name="fuelIn" placeholder="Combustible entrada" disabled={!canWrite} />
            <input name="notes" placeholder="Notas" disabled={!canWrite} />
            <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
              <option value="false">Sin override</option>
              <option value="true">Confirmar override</option>
            </select>
            <input name="overrideReason" placeholder="Motivo override" disabled={!canWrite} />
            <button className="secondary-btn" type="submit" disabled={!canWrite}>Cambiar vehículo</button>
          </form>
        </section>
      ) : null}

      {tab === "renumerar" ? (
        <section className="card stack-sm">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="renumerar" />
            <select name="renumberContractId" defaultValue={selectedRenumberContract?.id ?? ""}>
              <option value="">Selecciona contrato abierto</option>
              {openContracts.map((contract) => (
                <option key={`ren-${contract.id}`} value={contract.id}>
                  {contract.contractNumber} | {contract.customerName} | {contract.branchCode}
                </option>
              ))}
            </select>
            <button className="secondary-btn" type="submit">Cargar contrato</button>
          </form>
          {selectedRenumberContract ? (
            <p className="muted-text">
              Contrato actual: {selectedRenumberContract.contractNumber} | Sucursal actual: {selectedRenumberContract.branchCode}
            </p>
          ) : null}
          <form action={renumberAction} className="mini-form">
            <input type="hidden" name="contractId" value={selectedRenumberContract?.id ?? ""} />
            <input name="contractNumber" defaultValue={selectedRenumberContract?.contractNumber ?? contractNumber} placeholder="Nº contrato actual" disabled={!canWrite} />
            <input name="branchCode" placeholder="Sucursal destino" list="branch-target-list" disabled={!canWrite} />
            <datalist id="branch-target-list">
              {(settings.branches ?? []).map((item) => (
                <option key={`b-${item.code}`} value={item.code}>{item.name}</option>
              ))}
            </datalist>
            <input name="reason" placeholder="Motivo" disabled={!canWrite} />
            <button className="secondary-btn" type="submit" disabled={!canWrite}>Renumerar</button>
          </form>
          <p className="muted-text">Sucursales configuradas: {(settings.branches ?? []).map((item) => `${item.code} - ${item.name}`).join(" | ") || "N/D"}</p>
        </section>
      ) : null}

      {tab === "asignacion" ? (
        <section className="card stack-sm">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="asignacion" />
            <select name="assignContractId" defaultValue={selectedAssignContract?.id ?? ""}>
              <option value="">Selecciona contrato sin matrícula</option>
              {unassignedContracts.map((contract) => (
                <option key={`assign-${contract.id}`} value={contract.id}>
                  {contract.contractNumber} | {contract.customerName} | {contract.billedCarGroup}
                </option>
              ))}
            </select>
            <button className="secondary-btn" type="submit">Cargar contrato</button>
          </form>
          {selectedAssignContract ? (
            <form action={assignPlateToContractAction} className="mini-form">
              <input type="hidden" name="contractId" value={selectedAssignContract.id} />
              <input name="vehiclePlate" placeholder="Matrícula" list="fleet-assign-selected" disabled={!canWrite} />
              <datalist id="fleet-assign-selected">
                {fleet.map((vehicle) => (
                  <option key={`selected-${vehicle.id}`} value={vehicle.plate}>{vehicle.categoryLabel}</option>
                ))}
              </datalist>
              <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                <option value="false">Sin override</option>
                <option value="true">Confirmar override</option>
              </select>
              <input name="overrideReason" placeholder="Motivo override" disabled={!canWrite} />
              <button className="secondary-btn" type="submit" disabled={!canWrite}>Asignar matrícula</button>
            </form>
          ) : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Contrato</th><th>Cliente</th><th>Grupo</th><th>Entrega</th><th>Recogida</th><th>Asignar</th></tr></thead>
              <tbody>
                {unassignedContracts.length === 0 ? (
                  <tr><td colSpan={6} className="muted-text">Sin contratos pendientes.</td></tr>
                ) : (
                  unassignedContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.contractNumber}</td>
                      <td>{contract.customerName}</td>
                      <td>{contract.billedCarGroup}</td>
                      <td>{formatDateTimeDisplay(contract.deliveryAt)}</td>
                      <td>{formatDateTimeDisplay(contract.pickupAt)}</td>
                      <td>
                        <form action={assignPlateToContractAction} className="mini-form">
                          <input type="hidden" name="contractId" value={contract.id} />
                          <input name="vehiclePlate" placeholder="Matrícula" list={`fleet-assign-${contract.id}`} disabled={!canWrite} />
                          <datalist id={`fleet-assign-${contract.id}`}>
                            {fleet.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.plate}>{vehicle.categoryLabel}</option>
                            ))}
                          </datalist>
                          <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                            <option value="false">Sin override</option>
                            <option value="true">Confirmar override</option>
                          </select>
                          <input name="overrideReason" placeholder="Motivo override" disabled={!canWrite} />
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Asignar</button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "informes" ? (
        <section className="card stack-sm">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="informes" />
            <input name="reportQ" defaultValue={reportQ} placeholder="Contrato / cliente / matrícula" />
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <input name="reportBranch" defaultValue={reportBranch} placeholder="Sucursal" />
            <select name="reportStatus" defaultValue={reportStatus}>
              <option value="TODOS">Estado: todos</option>
              <option value="ABIERTO">Abierto</option>
              <option value="CERRADO">Cerrado</option>
            </select>
            <select name="reportDateField" defaultValue={reportDateField}>
              <option value="CREACION">Fecha creación</option>
              <option value="ENTREGA">Fecha entrega</option>
              <option value="RECOGIDA">Fecha recogida</option>
            </select>
            <select name="reportOrder" defaultValue={reportOrder}>
              <option value="DESC">Descendente</option>
              <option value="ASC">Ascendente</option>
            </select>
            <button className="secondary-btn" type="submit">Actualizar</button>
            <a
              className="secondary-btn text-center"
              href={`/api/reporting/contratos/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(reportQ)}&status=${encodeURIComponent(reportStatus)}&branch=${encodeURIComponent(reportBranch)}&dateField=${encodeURIComponent(reportDateField)}&order=${encodeURIComponent(reportOrder)}`}
            >
              Exportar PDF
            </a>
          </form>
          <p className="muted-text">Contratos en rango: {reportContracts.length} | Importe total: {formatMoneyDisplay(reportTotal)}</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Contrato</th><th>Cliente</th><th>Entrega</th><th>Recogida</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>
                {reportContracts.length === 0 ? (
                  <tr><td colSpan={7} className="muted-text">Sin datos.</td></tr>
                ) : (
                  reportContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.contractNumber}</td>
                      <td>{contract.customerName}</td>
                      <td>{formatDateTimeDisplay(contract.deliveryAt)}</td>
                      <td>{formatDateTimeDisplay(contract.pickupAt)}</td>
                      <td>{contract.status}</td>
                      <td>{formatMoneyDisplay(contract.totalSettlement)}</td>
                      <td className="inline-actions-cell">
                        <a className="secondary-btn text-center" href={`/contratos?tab=gestion&contractId=${contract.id}`}>Abrir</a>
                        <a className="primary-btn text-center" href={`/api/contratos/${contract.id}/pdf`} download>Imprimir</a>
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
