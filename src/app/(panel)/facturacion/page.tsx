import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  changeInvoiceDate,
  createDerivedInvoiceFromSource,
  createManualInvoice,
  deleteInvoice,
  finalizeInvoice,
  getCompanySettings,
  listContractClosureReconciliation,
  listContracts,
  listExpenseJournal,
  listFleetVehicles,
  listInvoiceJournal,
  listInvoiceSendLogs,
  listReservations,
  listSalesChannels,
  getSalesChannelStats,
  addSalesChannel,
  renameInvoice,
} from "@/lib/services/rental-service";
import { sendInvoiceUsingTemplate } from "@/lib/services/invoice-mail-service";
import { ModuleHelp } from "@/components/module-help";
import { withActionLock } from "@/lib/action-lock";
import { getActionErrorMessage } from "@/lib/action-errors";

type Props = {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    plate?: string;
    error?: string;
    tab?: string;
    invoiceType?: string;
    statsTab?: string;
    addedChannel?: string;
  }>;
};

type FacturacionTab = "facturas" | "gastos" | "conciliacion" | "envios" | "estadisticas" | "crear-factura";
type EstadisticasTab = "kpi" | "facturacion" | "reservas" | "contratos" | "ocupacion" | "canales";

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

function parseDateSafe(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isInRange(isoValue: string, fromDate: string, toDate: string) {
  const value = parseDateSafe(isoValue);
  const start = parseDateSafe(`${fromDate}T00:00:00`);
  const end = parseDateSafe(`${toDate}T23:59:59`);
  if (!value || !start || !end) return false;
  return value >= start && value <= end;
}

function hasOverlap(startA: string, endA: string, startB: Date, endB: Date) {
  const aStart = parseDateSafe(startA);
  const aEnd = parseDateSafe(endA);
  if (!aStart || !aEnd) return false;
  return aStart < endB && startB < aEnd;
}

function monthIndexFromIso(value: string): number | null {
  const date = parseDateSafe(value);
  if (!date) return null;
  return date.getMonth();
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function yearOfIso(value: string): number | null {
  const date = parseDateSafe(value);
  return date ? date.getFullYear() : null;
}

export default async function FacturacionPage({ searchParams }: Props) {
  // Página de diario de facturas + operaciones de mantenimiento y envío.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "LECTOR") {
    redirect("/dashboard?error=Permiso+denegado");
  }

  const params = await searchParams;
  const tabRaw = params.tab ?? "facturas";
  const tabNormalized = tabRaw === "kpi" ? "estadisticas" : tabRaw;
  const tab: FacturacionTab = (["facturas", "gastos", "conciliacion", "envios", "estadisticas", "crear-factura"] as const).includes(
    tabNormalized as FacturacionTab,
  )
    ? (tabNormalized as FacturacionTab)
    : "facturas";
  const statsTabRaw = params.statsTab ?? "kpi";
  const statsTab: EstadisticasTab = (["kpi", "facturacion", "reservas", "contratos", "ocupacion", "canales"] as const).includes(
    statsTabRaw as EstadisticasTab,
  )
    ? (statsTabRaw as EstadisticasTab)
    : "kpi";
  const q = params.q ?? "";
  const invoiceTypeParam = (params.invoiceType ?? "F").toUpperCase();
  const defaultInvoiceType = (["F", "V", "R", "A"] as const).includes(invoiceTypeParam as "F" | "V" | "R" | "A")
    ? (invoiceTypeParam as "F" | "V" | "R" | "A")
    : "F";
  const range = getDefaultRange();
  const from = params.from ?? range.from;
  const to = params.to ?? range.to;
  const plate = params.plate ?? "";
  const canWrite = true;

  const [companySettings, invoices, sendLogs, expenseJournal, closures, reservations, contracts, fleet, salesChannels, salesChannelStats] = await Promise.all([
    getCompanySettings(),
    listInvoiceJournal({ q, from, to }),
    listInvoiceSendLogs({ from: `${from}T00:00:00`, to: `${to}T23:59:59` }),
    listExpenseJournal({ from, to, plate }),
    listContractClosureReconciliation({ from, to }),
    listReservations(""),
    listContracts(""),
    listFleetVehicles(),
    listSalesChannels(),
    getSalesChannelStats({ from, to }),
  ]);
  const reservationsInRange = reservations.filter((reservation) => isInRange(reservation.createdAt, from, to));
  const reservationsDeliveryInRange = reservations.filter((reservation) => isInRange(reservation.deliveryAt, from, to));
  const contractsInRange = contracts.filter((contract) => isInRange(contract.createdAt, from, to));
  const contractsClosedInRange = contracts.filter((contract) => contract.closedAt && isInRange(contract.closedAt, from, to));
  const kpiFacturado = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const kpiEnviadas = sendLogs.filter((log) => log.status === "ENVIADA").length;
  const kpiErroresEnvio = sendLogs.filter((log) => log.status === "ERROR").length;
  const kpiCajaTotal = closures.reduce((sum, row) => sum + row.cashAmount, 0);
  const kpiFacturaTotal = closures.reduce((sum, row) => sum + row.invoiceTotal, 0);
  const kpiDiferenciaCajaFactura = kpiCajaTotal - kpiFacturaTotal;
  const kpiReservas = reservationsInRange.length;
  const kpiContratos = contractsInRange.length;
  const kpiFlotaActiva = fleet.filter((item) => item.status === "ALTA").length;
  const kpiContratoMedio = contractsInRange.length > 0 ? contractsInRange.reduce((sum, item) => sum + item.totalSettlement, 0) / contractsInRange.length : 0;

  const invoiceTotalsByMonth = Array.from({ length: 12 }, () => 0);
  const invoiceCountByMonth = Array.from({ length: 12 }, () => 0);
  invoices.forEach((invoice) => {
    const month = monthIndexFromIso(invoice.issuedAt);
    if (month === null) return;
    invoiceTotalsByMonth[month] += invoice.totalAmount;
    invoiceCountByMonth[month] += 1;
  });
  const maxInvoiceMonthlyTotal = Math.max(1, ...invoiceTotalsByMonth);
  const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const selectedYear = yearOfIso(`${to}T00:00:00`) ?? new Date().getFullYear();
  const previousYear = selectedYear - 1;
  const invoiceYearTotal = (year: number) =>
    invoices
      .filter((invoice) => yearOfIso(invoice.issuedAt) === year)
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const reservationYearCount = (year: number) => reservations.filter((reservation) => yearOfIso(reservation.createdAt) === year).length;
  const contractYearCount = (year: number) => contracts.filter((contract) => yearOfIso(contract.createdAt) === year).length;
  const selectedYearRevenue = invoiceYearTotal(selectedYear);
  const previousYearRevenue = invoiceYearTotal(previousYear);
  const selectedYearReservations = reservationYearCount(selectedYear);
  const previousYearReservations = reservationYearCount(previousYear);
  const selectedYearContracts = contractYearCount(selectedYear);
  const previousYearContracts = contractYearCount(previousYear);

  const invoiceTypeRows = ["F", "V", "R", "A"].map((type) => {
    const rows = invoices.filter((invoice) => invoice.invoiceType === type);
    const total = rows.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    return { type, count: rows.length, total };
  });

  const reservationsByStatus = {
    peticion: reservationsInRange.filter((item) => item.reservationStatus === "PETICION").length,
    confirmada: reservationsInRange.filter((item) => item.reservationStatus === "CONFIRMADA").length,
    contratada: reservationsInRange.filter((item) => Boolean(item.contractId)).length,
    huerfana: reservationsInRange.filter((item) => !item.assignedPlate && item.reservationStatus === "CONFIRMADA").length,
  };
  const reservationsByChannel = Array.from(
    reservationsInRange.reduce<Map<string, number>>((acc, reservation) => {
      const key = reservation.salesChannel.trim() || "N/D";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map()).entries(),
  )
    .map(([channel, count]) => ({ channel, count }))
    .toSorted((a, b) => b.count - a.count);
  const channelTotal = salesChannelStats.reduce((sum, row) => sum + row.total, 0);
  const reservationsRevenueTotal = reservationsInRange.reduce((sum, reservation) => sum + reservation.totalPrice, 0);
  const channelAmountMap = reservationsInRange.reduce<Map<string, number>>((acc, reservation) => {
    const channel = reservation.salesChannel.trim() || "N/D";
    acc.set(channel, (acc.get(channel) ?? 0) + reservation.totalPrice);
    return acc;
  }, new Map());
  const salesChannelRows = Array.from(
    new Set([...salesChannels, ...salesChannelStats.map((item) => item.channel), ...channelAmountMap.keys()]),
  )
    .map((channel) => ({
      channel,
      total: salesChannelStats.find((item) => item.channel === channel)?.total ?? 0,
      amount: channelAmountMap.get(channel) ?? 0,
    }))
    .toSorted((a, b) => b.total - a.total || b.amount - a.amount);
  const addedChannel = (params.addedChannel ?? "").trim();
  const salesChannelChoices = Array.from(new Set(["WEB", "DIRECTO", "AGENCIA", ...salesChannels, addedChannel].filter(Boolean))).toSorted((a, b) =>
    a.localeCompare(b),
  );
  const reservationsByBranch = Array.from(
    reservationsDeliveryInRange.reduce<Map<string, number>>((acc, reservation) => {
      const key = reservation.branchDelivery.trim() || "N/D";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map()).entries(),
  )
    .map(([branch, count]) => ({ branch, count }))
    .toSorted((a, b) => b.count - a.count);
  const maxReservationBranch = Math.max(1, ...reservationsByBranch.map((item) => item.count), 1);

  const contractsByStatus = {
    abierto: contractsInRange.filter((item) => item.status === "ABIERTO").length,
    cerrado: contractsInRange.filter((item) => item.status === "CERRADO").length,
  };
  const contractsByBranch = Array.from(
    contractsInRange.reduce<Map<string, number>>((acc, contract) => {
      const key = contract.branchCode.trim() || "N/D";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map()).entries(),
  )
    .map(([branch, count]) => ({ branch, count }))
    .toSorted((a, b) => b.count - a.count);
  const contractsByGroup = Array.from(
    contractsInRange.reduce<Map<string, number>>((acc, contract) => {
      const key = contract.billedCarGroup.trim() || "N/D";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map()).entries(),
  )
    .map(([group, count]) => ({ group, count }))
    .toSorted((a, b) => b.count - a.count);
  const maxContractBranch = Math.max(1, ...contractsByBranch.map((item) => item.count), 1);

  const fleetActive = fleet.filter((item) => item.status === "ALTA");
  const rangeStart = parseDateSafe(`${from}T00:00:00`);
  const rangeEnd = parseDateSafe(`${to}T23:59:59`);
  let availableVehicleDays = 0;
  let occupiedVehicleDays = 0;
  const occupancyByGroup = new Map<string, { available: number; occupied: number }>();
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    const dayCount = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    for (let day = 0; day < dayCount; day += 1) {
      const dayStart = new Date(rangeStart.getTime() + day * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      for (const vehicle of fleetActive) {
        const activeFrom = parseDateSafe(vehicle.activeFrom) ?? new Date("2000-01-01T00:00:00");
        const activeUntil = vehicle.activeUntil ? parseDateSafe(`${vehicle.activeUntil}T23:59:59`) : null;
        if (dayEnd <= activeFrom) continue;
        if (activeUntil && dayStart > activeUntil) continue;
        availableVehicleDays += 1;
        const groupToken = vehicle.categoryLabel.split(" - ")[0] || "N/D";
        if (!occupancyByGroup.has(groupToken)) {
          occupancyByGroup.set(groupToken, { available: 0, occupied: 0 });
        }
        occupancyByGroup.get(groupToken)!.available += 1;

        const plateValue = vehicle.plate.toUpperCase();
        const contractBusy = contracts.some(
          (contract) => contract.vehiclePlate.toUpperCase() === plateValue && hasOverlap(contract.deliveryAt, contract.pickupAt, dayStart, dayEnd),
        );
        const reservationBusy = reservations.some(
          (reservation) =>
            reservation.assignedPlate.toUpperCase() === plateValue &&
            reservation.reservationStatus !== "PETICION" &&
            hasOverlap(reservation.deliveryAt, reservation.pickupAt, dayStart, dayEnd),
        );
        if (contractBusy || reservationBusy) {
          occupiedVehicleDays += 1;
          occupancyByGroup.get(groupToken)!.occupied += 1;
        }
      }
    }
  }
  const occupancyRows = Array.from(occupancyByGroup.entries())
    .map(([group, value]) => ({
      group,
      available: value.available,
      occupied: value.occupied,
      occupancyPercent: pct(value.occupied, value.available),
    }))
    .toSorted((a, b) => b.occupancyPercent - a.occupancyPercent);

  const helpByTab = {
    facturas: ["Filtra por rango.", "Revisa factura y envío.", "Exporta o abre contrato."],
    gastos: ["Consulta diario contable.", "Filtra por matrícula.", "Controla total de gastos internos."],
    conciliacion: ["Revisa cierre vs caja.", "Detecta diferencias.", "Abre contrato para validar."],
    envios: ["Filtra periodo.", "Revisa estado de email.", "Corrige destino y reenvía."],
    estadisticas: ["Consulta KPIs y evolución.", "Compara reservas, contratos y facturación.", "Controla ocupación de flota por rango."],
    "crear-factura": ["Define receptor y concepto.", "Introduce importes e IVA.", "Guarda factura manual."],
  } as const;

  // Server Action: renombrado funcional de factura.
  async function renameAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    }
    try {
      await renameInvoice(String(formData.get("invoiceId") ?? ""), String(formData.get("invoiceName") ?? ""), {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/facturacion");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error renombrando factura");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
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
      redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    }
    const date = String(formData.get("issuedAt") ?? "");
    if (!date) {
      redirect("/facturacion?tab=facturas&error=Fecha+obligatoria");
    }
    try {
      await changeInvoiceDate(String(formData.get("invoiceId") ?? ""), `${date}T00:00:00`, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/facturacion");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error cambiando fecha");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
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
      redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    }
    try {
      await sendInvoiceUsingTemplate({
        invoiceId: String(formData.get("invoiceId") ?? ""),
        toEmail: String(formData.get("toEmail") ?? ""),
        actor: { id: actor.id, role: actor.role },
      });
      revalidatePath("/facturacion");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error enviando factura");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteInvoiceAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    const invoiceId = String(formData.get("invoiceId") ?? "");
    try {
      await deleteInvoice(invoiceId, { id: actor.id, role: actor.role });
      revalidatePath("/facturacion");
      revalidatePath("/contratos");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error borrando factura");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
    }
  }

  async function finalizeInvoiceAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    const invoiceId = String(formData.get("invoiceId") ?? "");
    try {
      await finalizeInvoice(invoiceId, { id: actor.id, role: actor.role });
      revalidatePath("/facturacion");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error finalizando factura");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
    }
  }

  async function createDerivedInvoiceAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    const sourceInvoiceId = String(formData.get("sourceInvoiceId") ?? "");
    const invoiceTypeRaw = String(formData.get("invoiceType") ?? "R").toUpperCase();
    const invoiceType = invoiceTypeRaw === "A" ? "A" : "R";
    try {
      await withActionLock(`invoice:derived:${actor.id}:${sourceInvoiceId}:${invoiceType}`, async () => {
        await createDerivedInvoiceFromSource(sourceInvoiceId, { invoiceType }, { id: actor.id, role: actor.role });
      });
      revalidatePath("/facturacion");
      redirect("/facturacion?tab=facturas");
    } catch (error) {
      const message = getActionErrorMessage(error, "Error creando factura derivada");
      redirect(`/facturacion?tab=facturas&error=${encodeURIComponent(message)}`);
    }
  }

  async function createManualInvoiceAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?tab=facturas&error=Permiso+denegado");
    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const invoiceType = (input.invoiceType ?? defaultInvoiceType).toUpperCase();
    try {
      await withActionLock(
        `invoice:manual:${actor.id}:${input.branchCode ?? ""}:${input.issuedDate ?? ""}:${input.manualCustomerName ?? ""}:${input.baseAmount ?? ""}`,
        async () => {
          await createManualInvoice(input, { id: actor.id, role: actor.role });
        },
      );
      revalidatePath("/facturacion");
      redirect(`/facturacion?tab=facturas&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error creando factura manual");
      redirect(`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&invoiceType=${encodeURIComponent(invoiceType)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function createSalesChannelAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/facturacion?tab=estadisticas&statsTab=canales&error=Permiso+denegado");
    const selected = String(formData.get("salesChannelName") ?? "").trim();
    const custom = String(formData.get("customSalesChannelName") ?? "").trim();
    const value = custom || selected;
    try {
      await addSalesChannel(value, { id: actor.id, role: actor.role });
      revalidatePath("/facturacion");
      revalidatePath("/reservas");
      redirect(`/facturacion?tab=estadisticas&statsTab=canales&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&addedChannel=${encodeURIComponent(value)}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error al crear canal");
      redirect(`/facturacion?tab=estadisticas&statsTab=canales&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      <section className="card stack-sm">
        <div className="table-header-row tab-nav-grid">
          <a className={tab === "facturas" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=facturas&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
            Diario
          </a>
          <a className={tab === "gastos" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=gastos&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
            Gastos internos
          </a>
          <a className={tab === "conciliacion" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=conciliacion&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
            Conciliación
          </a>
          <a className={tab === "envios" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=envios&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
            Logs envíos
          </a>
          <a className={tab === "estadisticas" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=${encodeURIComponent(statsTab)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
            Estadísticas
          </a>
          <a className={tab === "crear-factura" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&invoiceType=F`}>
            Crear factura
          </a>
        </div>
      </section>
      <ModuleHelp title="Ayuda rápida de Facturación" steps={helpByTab[tab]} />

      {tab === "facturas" ? (
      <section className="card stack-sm">
        <div className="table-header-row">
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="facturas" />
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
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Desglose + IVA</th>
                <th>Total</th>
                <th>Último envío</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={10} className="muted-text">Sin facturas.</td></tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.invoiceName}</td>
                    <td>{invoice.contractId || "MANUAL"}</td>
                    <td>{invoice.invoiceType}</td>
                    <td>{invoice.status === "FINAL" ? "Final" : "Borrador"}</td>
                    <td>{invoice.issuedAt.slice(0, 10)}</td>
                    <td>
                      Base {invoice.baseAmount.toFixed(2)} + IVA {invoice.ivaAmount.toFixed(2)} ({invoice.ivaPercent.toFixed(2)}%)
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
                          {invoice.contractId ? (
                            <a className="secondary-btn text-center" href={`/contratos?q=${invoice.contractId}`}>
                              Ver contrato
                            </a>
                          ) : null}
                          {canWrite ? (
                            <>
                              {invoice.status === "BORRADOR" ? (
                                <>
                                  <form action={renameAction} className="inline-search">
                                    <input type="hidden" name="invoiceId" value={invoice.id} />
                                    <input name="invoiceName" defaultValue={invoice.invoiceName} />
                                    <button className="secondary-btn" type="submit">Cambiar nombre</button>
                                  </form>
                                  <form action={changeDateAction} className="inline-search">
                                    <input type="hidden" name="invoiceId" value={invoice.id} />
                                    <input name="issuedAt" type="date" defaultValue={invoice.issuedAt.slice(0, 10)} />
                                    <button className="secondary-btn" type="submit">Cambiar fecha</button>
                                  </form>
                                  <form action={finalizeInvoiceAction} className="inline-search">
                                    <input type="hidden" name="invoiceId" value={invoice.id} />
                                    <button className="primary-btn" type="submit">Finalizar</button>
                                  </form>
                                </>
                              ) : (
                                <p className="muted-text">Factura final</p>
                              )}
                              <form action={sendAction} className="inline-search">
                                <input type="hidden" name="invoiceId" value={invoice.id} />
                                <input name="toEmail" placeholder="cliente@dominio.com" />
                                <button className="primary-btn" type="submit">Enviar mail</button>
                              </form>
                              {invoice.status === "BORRADOR" ? (
                                <form action={deleteInvoiceAction} className="inline-search">
                                  <input type="hidden" name="invoiceId" value={invoice.id} />
                                  <button className="secondary-btn" type="submit">Borrar factura</button>
                                </form>
                              ) : null}
                              <form action={createDerivedInvoiceAction} className="inline-search">
                                <input type="hidden" name="sourceInvoiceId" value={invoice.id} />
                                <input type="hidden" name="invoiceType" value="R" />
                                <button className="secondary-btn" type="submit">Crear rectificativa</button>
                              </form>
                              <form action={createDerivedInvoiceAction} className="inline-search">
                                <input type="hidden" name="sourceInvoiceId" value={invoice.id} />
                                <input type="hidden" name="invoiceType" value="A" />
                                <button className="secondary-btn" type="submit">Crear abono</button>
                              </form>
                            </>
                          ) : null}
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
      ) : null}

      {tab === "crear-factura" ? (
      <section className="card stack-sm">
        <h3>Crear factura manual</h3>
        <div className="table-header-row">
          <a className={defaultInvoiceType === "F" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&invoiceType=F`}>Generales (F)</a>
          <a className={defaultInvoiceType === "V" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&invoiceType=V`}>Venta vehículo (V)</a>
          <a className={defaultInvoiceType === "R" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&invoiceType=R`}>Rectificativa (R)</a>
          <a className={defaultInvoiceType === "A" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=crear-factura&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}&invoiceType=A`}>Abono (A)</a>
        </div>
        <form action={createManualInvoiceAction} className="form-grid">
          <label>
            Sucursal *
            <select
              name="branchCode"
              required={companySettings.branches.length > 0}
              defaultValue={(companySettings.branches[0]?.code ?? "SUC-ND").trim()}
            >
              {companySettings.branches.length > 0 ? <option value="">Selecciona</option> : null}
              {companySettings.branches.length === 0 ? <option value="SUC-ND">N/D</option> : null}
              {companySettings.branches.map((branch) => (
                <option key={branch.code} value={branch.code}>{branch.code} · {branch.name}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha *
            <input name="issuedDate" type="date" required defaultValue={to} />
          </label>
          <label className="col-span-2">
            Concepto *
            <input
              name="invoiceName"
              required
              placeholder={
                defaultInvoiceType === "V"
                  ? "Concepto de venta de vehículo"
                  : defaultInvoiceType === "R"
                    ? "Concepto de factura rectificativa"
                    : defaultInvoiceType === "A"
                      ? "Concepto de abono"
                      : "Concepto de la factura"
              }
            />
          </label>
          <label className="col-span-2">
            Cliente / empresa receptor *
            <input name="manualCustomerName" required />
          </label>
          <label>
            NIF/CIF
            <input name="manualCustomerTaxId" />
          </label>
          <label>
            Email receptor
            <input name="manualCustomerEmail" type="email" />
          </label>
          <label className="col-span-2">
            Dirección receptor
            <input name="manualCustomerAddress" />
          </label>
          <label>
            Base
            <input name="baseAmount" type="number" step="0.01" defaultValue="0" />
          </label>
          <label>
            IVA (%)
            <input name="ivaPercent" type="number" step="0.01" defaultValue={String(companySettings.defaultIvaPercent)} />
          </label>
          <label>
            Idioma
            <select name="manualLanguage" defaultValue="es">
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </select>
          </label>
          <label>
            Tipo de factura
            <select name="invoiceType" defaultValue={defaultInvoiceType}>
              <option value="F">F · Generales</option>
              <option value="V">V · Venta vehículo</option>
              <option value="R">R · Rectificativa</option>
              <option value="A">A · Abono</option>
            </select>
          </label>
          <button className="primary-btn" type="submit">Crear factura</button>
        </form>
      </section>
      ) : null}

      {tab === "gastos" ? (
      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Diario contable</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="gastos" />
            <input type="hidden" name="q" value={q} />
            <input name="from" type="date" defaultValue={from} />
            <input name="to" type="date" defaultValue={to} />
            <input name="plate" defaultValue={plate} placeholder="Matrícula" />
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
      ) : null}

      {tab === "conciliacion" ? (
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
      ) : null}

      {tab === "envios" ? (
      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Logs de facturas enviadas</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="envios" />
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
      ) : null}

      {tab === "estadisticas" ? (
        <section className="card stack-sm">
          <div className="table-header-row">
            <h3>Estadísticas</h3>
            <form method="GET" className="inline-search">
              <input type="hidden" name="tab" value="estadisticas" />
              <input type="hidden" name="statsTab" value={statsTab} />
              <input type="hidden" name="q" value={q} />
              <input type="hidden" name="plate" value={plate} />
              <input name="from" type="date" defaultValue={from} />
              <input name="to" type="date" defaultValue={to} />
              <button className="secondary-btn" type="submit">Aplicar rango</button>
            </form>
          </div>

          <div className="table-header-row tab-nav-grid">
            <a className={statsTab === "kpi" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=kpi&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              KPI
            </a>
            <a className={statsTab === "facturacion" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=facturacion&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              Facturación
            </a>
            <a className={statsTab === "reservas" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=reservas&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              Reservas
            </a>
            <a className={statsTab === "contratos" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=contratos&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              Contratos
            </a>
            <a className={statsTab === "ocupacion" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=ocupacion&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              Ocupación
            </a>
            <a className={statsTab === "canales" ? "primary-btn text-center" : "secondary-btn text-center"} href={`/facturacion?tab=estadisticas&statsTab=canales&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}&plate=${encodeURIComponent(plate)}`}>
              Canales
            </a>
          </div>

          {statsTab === "kpi" ? (
            <>
              <div className="stats-kpi-grid">
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Facturado</span><strong className="dashboard-kpi-value">{kpiFacturado.toFixed(2)} €</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Envíos OK</span><strong className="dashboard-kpi-value">{kpiEnviadas}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Errores envío</span><strong className="dashboard-kpi-value">{kpiErroresEnvio}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Reservas</span><strong className="dashboard-kpi-value">{kpiReservas}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Contratos</span><strong className="dashboard-kpi-value">{kpiContratos}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Flota activa</span><strong className="dashboard-kpi-value">{kpiFlotaActiva}</strong></article>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Caja conciliada</th>
                      <th>Factura conciliada</th>
                      <th>Diferencia</th>
                      <th>Ticket medio contrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{kpiCajaTotal.toFixed(2)} €</td>
                      <td>{kpiFacturaTotal.toFixed(2)} €</td>
                      <td>{kpiDiferenciaCajaFactura.toFixed(2)} €</td>
                      <td>{kpiContratoMedio.toFixed(2)} €</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th>{previousYear}</th>
                      <th>{selectedYear}</th>
                      <th>Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Facturación</td>
                      <td>{previousYearRevenue.toFixed(2)} €</td>
                      <td>{selectedYearRevenue.toFixed(2)} €</td>
                      <td>{pct(selectedYearRevenue - previousYearRevenue, Math.abs(previousYearRevenue) || 1).toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td>Reservas</td>
                      <td>{previousYearReservations}</td>
                      <td>{selectedYearReservations}</td>
                      <td>{pct(selectedYearReservations - previousYearReservations, Math.abs(previousYearReservations) || 1).toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td>Contratos</td>
                      <td>{previousYearContracts}</td>
                      <td>{selectedYearContracts}</td>
                      <td>{pct(selectedYearContracts - previousYearContracts, Math.abs(previousYearContracts) || 1).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {statsTab === "facturacion" ? (
            <div className="stack-sm">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Tipo</th><th>Unidades</th><th>Total</th><th>Peso</th></tr></thead>
                  <tbody>
                    {invoiceTypeRows.map((row) => (
                      <tr key={row.type}>
                        <td>{row.type}</td>
                        <td>{row.count}</td>
                        <td>{row.total.toFixed(2)} €</td>
                        <td>{pct(row.total, kpiFacturado).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="stack-sm">
                {monthLabels.map((month, idx) => (
                  <div key={month} className="stats-bar-row">
                    <span>{month}</span>
                    <div className="stats-bar-track">
                      <div className="stats-bar-fill" style={{ width: `${(invoiceTotalsByMonth[idx] / maxInvoiceMonthlyTotal) * 100}%` }} />
                    </div>
                    <strong>{invoiceTotalsByMonth[idx].toFixed(2)} €</strong>
                    <span className="muted-text">{invoiceCountByMonth[idx]} fact.</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {statsTab === "reservas" ? (
            <div className="stats-two-col">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
                  <tbody>
                    <tr><td>Reservas en petición</td><td>{reservationsByStatus.peticion}</td></tr>
                    <tr><td>Reservas confirmadas</td><td>{reservationsByStatus.confirmada}</td></tr>
                    <tr><td>Reservas contratadas</td><td>{reservationsByStatus.contratada}</td></tr>
                    <tr><td>Reservas huérfanas</td><td>{reservationsByStatus.huerfana}</td></tr>
                    <tr><td>Conversión a contrato</td><td>{pct(reservationsByStatus.contratada, reservationsInRange.length).toFixed(1)}%</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Canal</th><th>Reservas</th></tr></thead>
                  <tbody>
                    {reservationsByChannel.length === 0 ? (
                      <tr><td colSpan={2} className="muted-text">Sin datos</td></tr>
                    ) : (
                      reservationsByChannel.slice(0, 8).map((row) => (
                        <tr key={row.channel}><td>{row.channel}</td><td>{row.count}</td></tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="stats-two-col-span">
                <div className="stack-sm">
                  {reservationsByBranch.map((row) => (
                    <div key={row.branch} className="stats-bar-row">
                      <span>{row.branch}</span>
                      <div className="stats-bar-track">
                        <div className="stats-bar-fill" style={{ width: `${(row.count / maxReservationBranch) * 100}%` }} />
                      </div>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {statsTab === "contratos" ? (
            <div className="stats-two-col">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
                  <tbody>
                    <tr><td>Contratos abiertos</td><td>{contractsByStatus.abierto}</td></tr>
                    <tr><td>Contratos cerrados</td><td>{contractsByStatus.cerrado}</td></tr>
                    <tr><td>Cierres en rango</td><td>{contractsClosedInRange.length}</td></tr>
                    <tr><td>Ticket medio</td><td>{kpiContratoMedio.toFixed(2)} €</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Grupo</th><th>Contratos</th></tr></thead>
                  <tbody>
                    {contractsByGroup.length === 0 ? (
                      <tr><td colSpan={2} className="muted-text">Sin datos</td></tr>
                    ) : (
                      contractsByGroup.slice(0, 10).map((row) => (
                        <tr key={row.group}><td>{row.group}</td><td>{row.count}</td></tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="stats-two-col-span">
                <div className="stack-sm">
                  {contractsByBranch.map((row) => (
                    <div key={row.branch} className="stats-bar-row">
                      <span>{row.branch}</span>
                      <div className="stats-bar-track">
                        <div className="stats-bar-fill" style={{ width: `${(row.count / maxContractBranch) * 100}%` }} />
                      </div>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {statsTab === "ocupacion" ? (
            <div className="stack-sm">
              <div className="stats-kpi-grid stats-kpi-grid--four">
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Unidades activas</span><strong className="dashboard-kpi-value">{fleetActive.length}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Vehículo-día disponibles</span><strong className="dashboard-kpi-value">{availableVehicleDays}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Vehículo-día ocupados</span><strong className="dashboard-kpi-value">{occupiedVehicleDays}</strong></article>
                <article className="dashboard-kpi-card"><span className="dashboard-kpi-label">Ocupación global</span><strong className="dashboard-kpi-value">{pct(occupiedVehicleDays, availableVehicleDays).toFixed(1)}%</strong></article>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Grupo</th><th>Disponible</th><th>Ocupado</th><th>Ocupación</th></tr></thead>
                  <tbody>
                    {occupancyRows.length === 0 ? (
                      <tr><td colSpan={4} className="muted-text">Sin datos de ocupación.</td></tr>
                    ) : (
                      occupancyRows.map((row) => (
                        <tr key={row.group}>
                          <td>{row.group}</td>
                          <td>{row.available}</td>
                          <td>{row.occupied}</td>
                          <td>{row.occupancyPercent.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {statsTab === "canales" ? (
            <div className="stack-sm">
              <form action={createSalesChannelAction} className="inline-search">
                <select name="salesChannelName" defaultValue="WEB" disabled={!canWrite}>
                  {salesChannelChoices.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
                <input name="customSalesChannelName" placeholder="Nuevo canal (opcional)" disabled={!canWrite} />
                <button className="secondary-btn" type="submit" disabled={!canWrite}>Añadir canal</button>
              </form>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Canal</th><th>Reservas</th><th>% reservas</th><th>Importe</th><th>% importe</th></tr></thead>
                  <tbody>
                    {salesChannelRows.length === 0 ? (
                      <tr><td colSpan={5} className="muted-text">Sin datos para el rango.</td></tr>
                    ) : (
                      salesChannelRows.map((row) => (
                        <tr key={row.channel}>
                          <td>{row.channel}</td>
                          <td>{row.total}</td>
                          <td>{pct(row.total, channelTotal).toFixed(1)}%</td>
                          <td>{row.amount.toFixed(2)} €</td>
                          <td>{pct(row.amount, reservationsRevenueTotal).toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
