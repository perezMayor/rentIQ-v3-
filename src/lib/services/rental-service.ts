import { appendAuditEvent, readAuditEventsByContract, readAuditEventsByReservation } from "@/lib/audit";
import { unstable_noStore as noStore } from "next/cache";
import { getDocumentCompanyName } from "@/lib/company-brand";
import { sendMailFromCompany } from "@/lib/mail";
import { getTemplatePresetHtml } from "@/lib/services/template-presets";
import { buildReservationTemplateData, getReservationBaseTemplate, renderTemplateWithMacros } from "@/lib/services/template-renderer";
import type {
  BranchScheduleConfig,
  Client,
  CompanyBranch,
  Contract,
  FleetVehicle,
  InternalExpense,
  Invoice,
  RentalData,
  Reservation,
  RoleName,
  TariffPlan,
  TariffPrice,
  VehicleCategory,
  VehicleBlock,
  VehicleTask,
  VehicleModel,
  VehicleExtra,
  UserAccount,
} from "@/lib/domain/rental";
import { readRentalData, writeRentalData } from "@/lib/services/rental-store";
import { createHash } from "node:crypto";

// Helpers de normalización y cálculo usados por distintos módulos de negocio.
function getYear(inputIsoDate: string): string {
  const date = new Date(inputIsoDate);
  return String(Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear());
}

function getYearShort(inputIsoDate: string): string {
  return getYear(inputIsoDate).slice(-2);
}

function normalizeBranchCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "-");
  return cleaned || "SUC-ND";
}

function resolveBranchCodeFromInput(input: string, branches: Array<{ code: string; name: string }>): string {
  const raw = input.trim();
  if (!raw) return "SUC-ND";
  const rawUpper = raw.toUpperCase();
  const normalizedRaw = rawUpper.replace(/\s+/g, " ");

  const byCode = branches.find((item) => item.code.trim().toUpperCase() === rawUpper);
  if (byCode) return normalizeBranchCode(byCode.code);

  const byName = branches.find((item) => item.name.trim().toUpperCase().replace(/\s+/g, " ") === normalizedRaw);
  if (byName) return normalizeBranchCode(byName.code);

  return normalizeBranchCode(raw);
}

function resolveBranchFromInput(input: string, branches: CompanyBranch[]): CompanyBranch | null {
  const raw = input.trim();
  if (!raw) return null;
  const rawUpper = raw.toUpperCase();
  const normalizedRaw = rawUpper.replace(/\s+/g, " ");
  const byCode = branches.find((item) => item.code.trim().toUpperCase() === rawUpper);
  if (byCode) return byCode;
  const byName = branches.find((item) => item.name.trim().toUpperCase().replace(/\s+/g, " ") === normalizedRaw);
  if (byName) return byName;
  return null;
}

function parseNumber(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function getGlobalCourtesyHours(input: { courtesyHours?: number | null }): number {
  return Math.max(0, Number(input.courtesyHours ?? 0));
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function calculateReservationTotal(input: {
  baseAmount: number;
  discountAmount: number;
  extrasAmount: number;
  fuelAmount: number;
  insuranceAmount: number;
  penaltiesAmount: number;
}): number {
  return (
    input.baseAmount -
    input.discountAmount +
    input.extrasAmount +
    input.fuelAmount +
    input.insuranceAmount +
    input.penaltiesAmount
  );
}

type SelectedExtraInput = {
  extraId: string;
  units: number;
};

type SelectedDiscountInput = {
  percent: number;
};

function normalizeOwnerName(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function normalizeTimeSlot(input: string, fallback: string) {
  const value = input.trim();
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function defaultBranchDay() {
  return {
    enabled: true,
    start1: "08:00",
    end1: "13:00",
    start2: "16:00",
    end2: "20:00",
  };
}

function defaultBranchSchedule(nowIso: string, actorId: string): BranchScheduleConfig {
  const sunday = defaultBranchDay();
  sunday.enabled = false;
  return {
    periodLabel: "POR DEFECTO",
    timezone: "Europe/Madrid",
    language: "es",
    weekly: {
      monday: defaultBranchDay(),
      tuesday: defaultBranchDay(),
      wednesday: defaultBranchDay(),
      thursday: defaultBranchDay(),
      friday: defaultBranchDay(),
      saturday: defaultBranchDay(),
      sunday,
    },
    exceptions: [],
    updatedAt: nowIso,
    updatedBy: actorId,
  };
}

function normalizeBranchSchedules(
  input: unknown,
  fallback: Record<string, BranchScheduleConfig>,
  nowIso: string,
  actorId: string,
): Record<string, BranchScheduleConfig> {
  if (!input || typeof input !== "object") return fallback;
  const source = input as Record<string, unknown>;
  const result: Record<string, BranchScheduleConfig> = {};

  for (const [codeRaw, value] of Object.entries(source)) {
    const code = normalizeBranchCode(codeRaw);
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const base = defaultBranchSchedule(nowIso, actorId);
    const weeklyRaw = item.weekly && typeof item.weekly === "object" ? (item.weekly as Record<string, unknown>) : {};
    const weekly = { ...base.weekly };
    for (const dayKey of WEEKDAY_KEYS) {
      const dayRaw = weeklyRaw[dayKey];
      if (!dayRaw || typeof dayRaw !== "object") continue;
      const dayObj = dayRaw as Record<string, unknown>;
      weekly[dayKey] = {
        enabled: typeof dayObj.enabled === "boolean" ? dayObj.enabled : base.weekly[dayKey].enabled,
        start1: normalizeTimeSlot(String(dayObj.start1 ?? base.weekly[dayKey].start1), base.weekly[dayKey].start1),
        end1: normalizeTimeSlot(String(dayObj.end1 ?? base.weekly[dayKey].end1), base.weekly[dayKey].end1),
        start2: normalizeTimeSlot(String(dayObj.start2 ?? base.weekly[dayKey].start2), base.weekly[dayKey].start2),
        end2: normalizeTimeSlot(String(dayObj.end2 ?? base.weekly[dayKey].end2), base.weekly[dayKey].end2),
      };
    }
    const exceptionsRaw = Array.isArray(item.exceptions) ? item.exceptions : [];
    const exceptions = exceptionsRaw
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const date = String(row.date ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        const modeRaw = String(row.mode ?? "ABIERTA").toUpperCase();
        const mode = modeRaw === "CERRADA" ? "CERRADA" : "ABIERTA";
        return {
          date,
          mode,
          start1: normalizeTimeSlot(String(row.start1 ?? "08:00"), "08:00"),
          end1: normalizeTimeSlot(String(row.end1 ?? "13:00"), "13:00"),
          start2: normalizeTimeSlot(String(row.start2 ?? "16:00"), "16:00"),
          end2: normalizeTimeSlot(String(row.end2 ?? "20:00"), "20:00"),
          note: String(row.note ?? "").trim(),
        };
      })
      .filter((entry): entry is BranchScheduleConfig["exceptions"][number] => entry !== null)
      .toSorted((a, b) => a.date.localeCompare(b.date));

    result[code] = {
      periodLabel: String(item.periodLabel ?? base.periodLabel).trim() || base.periodLabel,
      timezone: String(item.timezone ?? base.timezone).trim() || base.timezone,
      language: String(item.language ?? base.language).trim() || base.language,
      weekly,
      exceptions,
      updatedAt: String(item.updatedAt ?? nowIso),
      updatedBy: String(item.updatedBy ?? actorId),
    };
  }

  return result;
}

function parseSelectedExtrasPayload(payloadRaw: string): SelectedExtraInput[] {
  const raw = payloadRaw.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as { extraId?: unknown; units?: unknown };
        const extraId = String(candidate.extraId ?? "").trim();
        if (!extraId) return null;
        const unitsNumber = Number(candidate.units ?? 1);
        const units = Number.isFinite(unitsNumber) ? Math.max(1, Math.floor(unitsNumber)) : 1;
        return { extraId, units };
      })
      .filter((item): item is SelectedExtraInput => item !== null);
    return normalized;
  } catch {
    return [];
  }
}

function parseSelectedDiscountsPayload(payloadRaw: string): SelectedDiscountInput[] {
  const raw = payloadRaw.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as { percent?: unknown };
        const percentNumber = Number(candidate.percent ?? 0);
        if (!Number.isFinite(percentNumber) || percentNumber <= 0) return null;
        return { percent: Number(percentNumber.toFixed(2)) };
      })
      .filter((item): item is SelectedDiscountInput => item !== null);
  } catch {
    return [];
  }
}

function calculateExtrasFromSelection(
  input: { selected: SelectedExtraInput[]; billedDays: number; fallbackAmount: number; fallbackBreakdown: string },
  extrasCatalog: VehicleExtra[],
) {
  if (input.selected.length === 0) {
    return { amount: input.fallbackAmount, breakdown: input.fallbackBreakdown };
  }

  let total = 0;
  const lines: string[] = [];
  for (const selection of input.selected) {
    const extra = extrasCatalog.find((item) => item.id === selection.extraId && item.active);
    if (!extra) continue;
    const requestedUnits = Math.max(1, selection.units ?? 1);
    const chargeDays =
      extra.priceMode === "POR_DIA"
        ? Math.max(1, extra.maxDays > 0 ? Math.min(input.billedDays || 1, extra.maxDays) : (input.billedDays || 1))
        : 0;
    const amount = extra.priceMode === "POR_DIA" ? extra.unitPrice * requestedUnits * chargeDays : extra.unitPrice * requestedUnits;
    total += amount;
    lines.push(
      `${extra.code}:${extra.name} x${requestedUnits}${extra.priceMode === "POR_DIA" ? ` x${chargeDays} dias` : ""} (${extra.priceMode === "POR_DIA" ? "dia" : "fijo"}) = ${amount.toFixed(2)}`,
    );
  }

  if (lines.length === 0) {
    return { amount: 0, breakdown: "" };
  }
  return { amount: Number(total.toFixed(2)), breakdown: lines.join(" | ") };
}

function calculateDiscountsFromSelection(input: {
  selected: SelectedDiscountInput[];
  baseAmount: number;
  fallbackAmount: number;
  fallbackBreakdown: string;
}) {
  if (input.selected.length === 0) {
    return { amount: input.fallbackAmount, breakdown: input.fallbackBreakdown };
  }

  let total = 0;
  const normalizedLines = input.selected.map((selection) => {
    const amount = Number(((input.baseAmount * selection.percent) / 100).toFixed(2));
    total += amount;
    return {
      percent: selection.percent,
      amount,
    };
  });

  return {
    amount: Number(total.toFixed(2)),
    breakdown: JSON.stringify(normalizedLines),
  };
}

function ensureAssignedPlateAvailabilityForReservation(input: {
  assignedPlate: string;
  deliveryAt: string;
  fleetVehicles: FleetVehicle[];
}) {
  if (!input.assignedPlate) {
    return { found: false, warningLimit: false };
  }
  const vehicle = input.fleetVehicles.find((item) => item.plate.toUpperCase() === input.assignedPlate.toUpperCase()) ?? null;
  if (!vehicle) {
    return { found: false, warningLimit: false };
  }
  if (vehicle.deactivatedAt) {
    throw new Error("No se puede reservar una matrícula dada de baja");
  }
  const delivery = parseDateSafe(input.deliveryAt);
  const limit = vehicle.activeUntil ? parseDateSafe(`${vehicle.activeUntil}T23:59:59`) : null;
  return { found: true, warningLimit: Boolean(delivery && limit && delivery > limit), vehicle };
}

function normalizeInvoiceSeries(input: string, fallback: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || fallback;
}

function buildContractNumber(yearShort: string, branchId: number, counter: number): string {
  const branchToken = String(Math.max(0, Math.floor(branchId))).padStart(2, "0");
  return `${yearShort}${branchToken}-${String(counter).padStart(4, "0")}`;
}

function buildInvoiceNumber(series: string, counter: number): string {
  return `${series}${String(counter).padStart(8, "0")}`;
}

function createSignatureEvidenceHash(input: {
  contractId: string;
  phase: "CHECKOUT" | "CHECKIN";
  signerName: string;
  signerId: string;
  notes: string;
  km: number;
  fuelLevel: string;
  signedAtIso: string;
}): string {
  const raw = [
    input.contractId,
    input.phase,
    input.signerName.trim().toUpperCase(),
    input.signerId.trim().toUpperCase(),
    input.notes.trim(),
    String(input.km),
    input.fuelLevel.trim().toUpperCase(),
    input.signedAtIso,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function resolveInvoiceCounterKey(input: {
  scope: "GLOBAL" | "BRANCH";
  branchCode: string;
  invoiceSeries: string;
}): string {
  if (input.scope === "GLOBAL") {
    return `GLOBAL-${input.invoiceSeries}`;
  }
  return `BRANCH-${input.branchCode}-${input.invoiceSeries}`;
}

function parseDateSafe(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function reservationAuditSnapshot(input: Reservation) {
  return {
    reservationStatus: input.reservationStatus,
    customerName: input.customerName,
    branchDelivery: input.branchDelivery,
    deliveryAt: input.deliveryAt,
    pickupAt: input.pickupAt,
    billedCarGroup: input.billedCarGroup,
    assignedPlate: input.assignedPlate,
    baseAmount: Number(input.baseAmount.toFixed(2)),
    discountAmount: Number(input.discountAmount.toFixed(2)),
    extrasAmount: Number(input.extrasAmount.toFixed(2)),
    fuelAmount: Number(input.fuelAmount.toFixed(2)),
    insuranceAmount: Number(input.insuranceAmount.toFixed(2)),
    penaltiesAmount: Number(input.penaltiesAmount.toFixed(2)),
    totalPrice: Number(input.totalPrice.toFixed(2)),
    appliedRate: input.appliedRate,
  };
}

function contractAuditSnapshot(input: Contract) {
  return {
    status: input.status,
    customerName: input.customerName,
    companyName: input.companyName,
    deliveryAt: input.deliveryAt,
    pickupAt: input.pickupAt,
    branchCode: input.branchCode,
    vehiclePlate: input.vehiclePlate,
    billedCarGroup: input.billedCarGroup,
    appliedRate: input.appliedRate,
    baseAmount: Number(input.baseAmount.toFixed(2)),
    extrasAmount: Number(input.extrasAmount.toFixed(2)),
    totalSettlement: Number(input.totalSettlement.toFixed(2)),
    ivaPercent: Number(input.ivaPercent.toFixed(2)),
    invoiceId: input.invoiceId ?? "",
  };
}

function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a1 = parseDateSafe(aStart);
  const a2 = parseDateSafe(aEnd);
  const b1 = parseDateSafe(bStart);
  const b2 = parseDateSafe(bEnd);
  if (!a1 || !a2 || !b1 || !b2) {
    return false;
  }
  return a1 < b2 && b1 < a2;
}

function toDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOnlyToDayNumber(value: string): number | null {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = parseDateSafe(`${raw}T00:00:00`);
  if (!parsed) return null;
  return Math.floor(parsed.getTime() / (24 * 60 * 60 * 1000));
}

function computeBilledDaysBy24h(deliveryAt: string, pickupAt: string, courtesyHours = 0): number {
  const delivery = parseDateSafe(deliveryAt);
  const pickup = parseDateSafe(pickupAt);
  if (!delivery || !pickup) return 1;
  const diffMs = pickup.getTime() - delivery.getTime();
  if (diffMs <= 0) return 1;
  const dayMs = 24 * 60 * 60 * 1000;
  const courtesyMs = Math.max(0, courtesyHours) * 60 * 60 * 1000;
  const fullDays = Math.floor(diffMs / dayMs);
  const remainder = diffMs - fullDays * dayMs;
  if (remainder <= 0) {
    return Math.max(1, fullDays);
  }
  return Math.max(1, fullDays + (remainder > courtesyMs ? 1 : 0));
}

type TariffComputationResult = {
  found: boolean;
  amount: number;
  bracketLabel: string;
  usedPlanId: string;
  isSeasonSplit: boolean;
};

const SPECIAL_RATE_CODE_SEASON_CROSS = "TXT";
const SPECIAL_RATE_CODE_MANUAL = "MAN";

function resolveTariffAmountForPlanDays(input: {
  data: RentalData;
  planId: string;
  groupCode: string;
  targetDays: number;
}): TariffComputationResult {
  const groupCode = input.groupCode.trim().toUpperCase();
  const days = Math.max(1, Math.floor(input.targetDays));
  const brackets = input.data.tariffBrackets
    .filter((item) => item.tariffPlanId === input.planId)
    .toSorted((a, b) => a.order - b.order);
  if (brackets.length === 0) {
    return { found: false, amount: 0, bracketLabel: "", usedPlanId: input.planId, isSeasonSplit: false };
  }

  const exact = brackets.find((item) => days >= item.fromDay && days <= item.toDay);
  if (exact) {
    const priceRow = input.data.tariffPrices.find(
      (item) =>
        item.tariffPlanId === input.planId &&
        item.bracketId === exact.id &&
        item.groupCode.toUpperCase() === groupCode,
    );
    if (priceRow) {
      return { found: true, amount: Number(priceRow.price.toFixed(2)), bracketLabel: exact.label, usedPlanId: input.planId, isSeasonSplit: false };
    }
  }

  const lower = brackets
    .filter((item) => item.toDay < days)
    .toSorted((a, b) => b.toDay - a.toDay)[0];
  if (!lower) {
    return { found: false, amount: 0, bracketLabel: "", usedPlanId: input.planId, isSeasonSplit: false };
  }
  const lowerPrice = input.data.tariffPrices.find(
    (item) =>
      item.tariffPlanId === input.planId &&
      item.bracketId === lower.id &&
      item.groupCode.toUpperCase() === groupCode,
  );
  if (!lowerPrice || lower.toDay <= 0) {
    return { found: false, amount: 0, bracketLabel: "", usedPlanId: input.planId, isSeasonSplit: false };
  }
  const perDay = lowerPrice.price / lower.toDay;
  return {
    found: true,
    amount: Number((perDay * days).toFixed(2)),
    bracketLabel: `${lower.label} prorrateado`,
    usedPlanId: input.planId,
    isSeasonSplit: false,
  };
}

function selectTariffPlanForDate(input: {
  plans: TariffPlan[];
  dateKey: string;
  fallbackPlanId: string;
}): TariffPlan | null {
  const dayNumber = dateOnlyToDayNumber(input.dateKey);
  if (dayNumber === null) {
    return input.plans.find((plan) => plan.id === input.fallbackPlanId) ?? input.plans[0] ?? null;
  }
  const matching = input.plans.filter((plan) => {
    const from = dateOnlyToDayNumber(plan.validFrom);
    const to = dateOnlyToDayNumber(plan.validTo);
    if (from !== null && dayNumber < from) return false;
    if (to !== null && dayNumber > to) return false;
    return true;
  });
  if (matching.length > 0) {
    return matching.toSorted((a, b) => {
      const aFrom = dateOnlyToDayNumber(a.validFrom) ?? Number.MIN_SAFE_INTEGER;
      const bFrom = dateOnlyToDayNumber(b.validFrom) ?? Number.MIN_SAFE_INTEGER;
      return aFrom - bFrom;
    })[0];
  }
  return input.plans.find((plan) => plan.id === input.fallbackPlanId) ?? input.plans[0] ?? null;
}

function calculateTariffAmountFromPlans(input: {
  data: RentalData;
  plans: TariffPlan[];
  groupCode: string;
  billedDays: number;
  deliveryAt?: string;
  pickupAt?: string;
  preferredPlanId?: string;
  courtesyHours?: number;
}): TariffComputationResult {
  const days = Math.max(1, Math.floor(input.billedDays));
  if (input.plans.length === 0) {
    return { found: false, amount: 0, bracketLabel: "", usedPlanId: "", isSeasonSplit: false };
  }

  const fallbackPlan =
    (input.preferredPlanId ? input.plans.find((plan) => plan.id === input.preferredPlanId) : null) ??
    input.plans.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!fallbackPlan) {
    return { found: false, amount: 0, bracketLabel: "", usedPlanId: "", isSeasonSplit: false };
  }

  const start = input.deliveryAt ? parseDateSafe(input.deliveryAt) : null;
  const end = input.pickupAt ? parseDateSafe(input.pickupAt) : null;
  const canSplitBySeason = Boolean(start && end && end.getTime() > start.getTime() && days > 1);

  if (!canSplitBySeason) {
    return resolveTariffAmountForPlanDays({
      data: input.data,
      planId: fallbackPlan.id,
      groupCode: input.groupCode,
      targetDays: days,
    });
  }

  const countedDays = computeBilledDaysBy24h(
    input.deliveryAt ?? "",
    input.pickupAt ?? "",
    Math.max(0, Number(input.courtesyHours ?? 0)),
  );
  const blocks = Math.max(days, countedDays);
  const planDays = new Map<string, number>();
  const ms24h = 24 * 60 * 60 * 1000;
  for (let i = 0; i < blocks; i += 1) {
    const dayStart = new Date(start!.getTime() + i * ms24h);
    const dateKey = toDateKeyLocal(dayStart);
    const planForDate = selectTariffPlanForDate({
      plans: input.plans,
      dateKey,
      fallbackPlanId: fallbackPlan.id,
    });
    if (!planForDate) continue;
    planDays.set(planForDate.id, (planDays.get(planForDate.id) ?? 0) + 1);
  }
  if (planDays.size <= 1) {
    const onlyPlanId = planDays.keys().next().value as string | undefined;
    return resolveTariffAmountForPlanDays({
      data: input.data,
      planId: onlyPlanId || fallbackPlan.id,
      groupCode: input.groupCode,
      targetDays: blocks,
    });
  }

  const referenceDays = blocks < 7 ? 3 : 7;
  let total = 0;
  const labels: string[] = [];
  for (const [planId, segmentDays] of planDays.entries()) {
    const base = resolveTariffAmountForPlanDays({
      data: input.data,
      planId,
      groupCode: input.groupCode,
      targetDays: referenceDays,
    });
    if (!base.found || referenceDays <= 0) {
      return { found: false, amount: 0, bracketLabel: "", usedPlanId: planId, isSeasonSplit: false };
    }
    const prorated = Number(((base.amount / referenceDays) * segmentDays).toFixed(2));
    total += prorated;
    labels.push(`${base.bracketLabel} x${segmentDays}d`);
  }
  return {
    found: true,
    amount: Number(total.toFixed(2)),
    bracketLabel: labels.join(" + "),
    usedPlanId: fallbackPlan.id,
    isSeasonSplit: true,
  };
}

function normalizeGroupToken(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function vehicleMatchesGroup(category: VehicleCategory | null, requestedGroup: string): boolean {
  if (!category) return false;
  const wanted = normalizeGroupToken(requestedGroup);
  if (!wanted) return false;
  const byCode = normalizeGroupToken(category.code) === wanted;
  const byName = normalizeGroupToken(category.name) === wanted;
  return byCode || byName;
}

function plateHasConflictsInPeriod(
  data: RentalData,
  plate: string,
  startAt: string,
  endAt: string,
  input?: { excludeReservationId?: string; excludeContractId?: string },
) {
  const normalized = plate.trim().toUpperCase();
  if (!normalized) return false;
  const conflictsReservation = data.reservations.some((item) => {
    if (input?.excludeReservationId && item.id === input.excludeReservationId) return false;
    if (!item.assignedPlate) return false;
    return (
      item.assignedPlate.trim().toUpperCase() === normalized &&
      hasOverlap(item.deliveryAt, item.pickupAt, startAt, endAt)
    );
  });
  if (conflictsReservation) return true;

  const conflictsContract = data.contracts.some((item) => {
    if (input?.excludeContractId && item.id === input.excludeContractId) return false;
    if (!item.vehiclePlate) return false;
    return item.vehiclePlate.trim().toUpperCase() === normalized && hasOverlap(item.deliveryAt, item.pickupAt, startAt, endAt);
  });
  if (conflictsContract) return true;

  return data.vehicleBlocks.some(
    (block) => block.vehiclePlate.trim().toUpperCase() === normalized && hasOverlap(block.startAt, block.endAt, startAt, endAt),
  );
}

function findFirstAvailablePlateForGroup(
  data: RentalData,
  input: {
    requestedGroup: string;
    startAt: string;
    endAt: string;
    excludeReservationId?: string;
    excludeContractId?: string;
  },
): string | null {
  const start = parseDateSafe(input.startAt);
  if (!start || !parseDateSafe(input.endAt)) return null;

  for (const vehicle of data.fleetVehicles) {
    if (vehicle.deactivatedAt) continue;
    const category = data.vehicleCategories.find((item) => item.id === vehicle.categoryId) ?? null;
    if (!vehicleMatchesGroup(category, input.requestedGroup)) continue;
    if (vehicle.activeUntil) {
      const limit = parseDateSafe(`${vehicle.activeUntil}T23:59:59`);
      if (limit && start > limit) continue;
    }
    const hasConflicts = plateHasConflictsInPeriod(data, vehicle.plate, input.startAt, input.endAt, {
      excludeReservationId: input.excludeReservationId,
      excludeContractId: input.excludeContractId,
    });
    if (!hasConflicts) return vehicle.plate.trim().toUpperCase();
  }

  return null;
}

function isInsideRange(value: string, from: string, to: string): boolean {
  const date = parseDateSafe(value);
  const fromDate = parseDateSafe(from);
  const toDate = parseDateSafe(to);
  if (!date || !fromDate || !toDate) {
    return false;
  }
  return date >= fromDate && date <= toDate;
}

// -------------------- Consultas globales --------------------
export async function listReservations(query: string): Promise<Reservation[]> {
  const data = await readRentalData();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return data.reservations.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return data.reservations
    .filter((reservation) => {
      return [
        reservation.reservationNumber,
        reservation.customerName,
        reservation.customerCompany,
        reservation.assignedPlate,
        reservation.deliveryAt,
        reservation.pickupAt,
        reservation.salesChannel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listReservationAudit(reservationId: string) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  return readAuditEventsByReservation({
    reservationId,
    contractId: reservation.contractId,
    limit: 300,
  });
}

export async function listContractAudit(contractId: string) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  return readAuditEventsByContract({
    contractId,
    reservationId: contract.reservationId,
    limit: 300,
  });
}

export async function getReservationForecast(input: { from: string; to: string }) {
  const data = await readRentalData();
  const from = parseDateSafe(`${input.from}T00:00:00`);
  const to = parseDateSafe(`${input.to}T23:59:59`);
  if (!from || !to || from > to) {
    throw new Error("Rango de previsión no válido");
  }
  const reservations = data.reservations.filter((reservation) =>
    hasOverlap(reservation.deliveryAt, reservation.pickupAt, from.toISOString(), to.toISOString()),
  );
  const requiredByGroup: Record<string, number> = {};
  for (const reservation of reservations) {
    const key = reservation.billedCarGroup || "N/D";
    requiredByGroup[key] = (requiredByGroup[key] ?? 0) + 1;
  }
  const fleetByGroup: Record<string, number> = {};
  for (const vehicle of data.fleetVehicles) {
    const category = data.vehicleCategories.find((item) => item.id === vehicle.categoryId);
    const key = category?.code || category?.name || "N/D";
    fleetByGroup[key] = (fleetByGroup[key] ?? 0) + 1;
  }
  const configuredGroups = data.vehicleCategories.map((item) => item.code || item.name).filter(Boolean);
  const allGroups = Array.from(new Set([...configuredGroups, ...Object.keys(requiredByGroup), ...Object.keys(fleetByGroup)]));
  return allGroups
    .map((group) => {
      const required = requiredByGroup[group] ?? 0;
      const available = fleetByGroup[group] ?? 0;
      return {
        group,
        required,
        available,
        deficit: Math.max(0, required - available),
      };
    })
    .toSorted((a, b) => a.group.localeCompare(b.group));
}

export async function listSalesChannels() {
  const data = await readRentalData();
  const configured = data.companySettings.salesChannels ?? [];
  const fromReservations = data.reservations.map((item) => item.salesChannel);
  const fromClients = data.clients.map((item) => item.acquisitionChannel);
  return Array.from(
    new Set(
      [...configured, ...fromReservations, ...fromClients]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).toSorted((a, b) => a.localeCompare(b));
}

export async function addSalesChannel(channel: string, actor: { id: string; role: RoleName }) {
  const value = channel.trim();
  if (!value) {
    throw new Error("Canal obligatorio");
  }
  const data = await readRentalData();
  const exists = (data.companySettings.salesChannels ?? []).some(
    (item) => item.trim().toLowerCase() === value.toLowerCase(),
  );
  if (!exists) {
    data.companySettings.salesChannels = [...(data.companySettings.salesChannels ?? []), value];
    data.companySettings.updatedAt = new Date().toISOString();
    data.companySettings.updatedBy = actor.id;
    await writeRentalData(data);
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "sales_channel",
      entityId: value.toLowerCase(),
      details: { channel: value },
    });
  }
}

export async function getSalesChannelStats(input: { from: string; to: string }) {
  const data = await readRentalData();
  const rows: Record<string, { channel: string; total: number }> = {};
  for (const reservation of data.reservations) {
    if (!isInsideRange(reservation.createdAt, `${input.from}T00:00:00`, `${input.to}T23:59:59`)) {
      continue;
    }
    const channel = reservation.salesChannel.trim() || "N/D";
    rows[channel] = rows[channel] ?? { channel, total: 0 };
    rows[channel].total += 1;
  }
  return Object.values(rows).toSorted((a, b) => b.total - a.total || a.channel.localeCompare(b.channel));
}

export async function listContracts(query: string): Promise<Contract[]> {
  const data = await readRentalData();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return data.contracts.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return data.contracts
    .filter((contract) => {
      return [
        contract.contractNumber,
        contract.customerName,
        contract.companyName,
        contract.vehiclePlate,
        contract.deliveryAt,
        contract.pickupAt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listInvoices(query: string): Promise<Invoice[]> {
  const data = await readRentalData();
  const normalizedInvoices = data.invoices.map((invoice) => ({
    ...invoice,
    invoiceName: invoice.invoiceName || `Factura ${invoice.invoiceNumber}`,
  }));
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return normalizedInvoices.toSorted((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  return normalizedInvoices
    .filter((invoice) => {
      return [invoice.invoiceNumber, invoice.invoiceName, invoice.contractId ?? "", invoice.issuedAt, invoice.manualCustomerName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .toSorted((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export async function listInvoiceJournal(input: { q: string; from: string; to: string }): Promise<Invoice[]> {
  const invoices = await listInvoices(input.q);
  const from = `${input.from}T00:00:00`;
  const to = `${input.to}T23:59:59`;
  return invoices
    .filter((invoice) => isInsideRange(invoice.issuedAt, from, to))
    .toSorted((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

// -------------------- Facturación --------------------
export async function renameInvoice(invoiceId: string, invoiceName: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }
  if (invoice.status === "FINAL") {
    throw new Error("Factura final: no se puede modificar");
  }
  const clean = invoiceName.trim();
  if (!clean) {
    throw new Error("Nombre de factura obligatorio");
  }
  invoice.invoiceName = clean;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_rename",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, invoiceName: clean },
  });
}

export async function changeInvoiceDate(invoiceId: string, issuedAt: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }
  if (invoice.status === "FINAL") {
    throw new Error("Factura final: no se puede modificar");
  }
  if (!parseDateSafe(issuedAt)) {
    throw new Error("Fecha de factura no válida");
  }
  invoice.issuedAt = issuedAt;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_change_date",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, issuedAt },
  });
}

export async function deleteInvoice(invoiceId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }
  if (invoice.status === "FINAL") {
    throw new Error("Factura final: no se puede borrar");
  }
  const linkedContract = data.contracts.find((item) => item.invoiceId === invoiceId);
  if (linkedContract) {
    if (linkedContract.status === "CERRADO") {
      throw new Error("No se puede borrar factura de contrato cerrado (trazabilidad obligatoria)");
    }
    linkedContract.invoiceId = null;
  }
  data.invoices = data.invoices.filter((item) => item.id !== invoiceId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_delete",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber },
  });
}

export async function sendInvoiceByEmail(
  invoiceId: string,
  toEmail: string,
  actor: { id: string; role: RoleName },
): Promise<void> {
  await recordInvoiceSendLog(invoiceId, toEmail, "ENVIADA", actor);
}

export async function recordInvoiceSendLog(
  invoiceId: string,
  toEmail: string,
  status: "ENVIADA" | "ERROR",
  actor: { id: string; role: RoleName },
): Promise<void> {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }
  if (!toEmail.trim()) {
    throw new Error("Email destino obligatorio");
  }

  invoice.sentLog.push({
    sentAt: new Date().toISOString(),
    sentBy: actor.id,
    to: toEmail.trim(),
    status,
  });
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_send_email",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, toEmail, status },
  });
}

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return null;
  }
  return {
    ...invoice,
    invoiceName: invoice.invoiceName || `Factura ${invoice.invoiceNumber}`,
  };
}

export async function createManualInvoice(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const issuedDate = (input.issuedDate ?? "").trim();
  if (!parseDateSafe(`${issuedDate}T00:00:00`)) {
    throw new Error("Fecha de factura no válida");
  }
  const branchCode = resolveBranchCodeFromInput(input.branchCode ?? "", data.companySettings.branches);
  if (!branchCode || (branchCode === "SUC-ND" && data.companySettings.branches.length > 0)) {
    throw new Error("Sucursal obligatoria");
  }
  const invoiceName = (input.invoiceName ?? "").trim();
  if (!invoiceName) {
    throw new Error("Concepto de factura obligatorio");
  }
  const receiverName = (input.manualCustomerName ?? "").trim();
  if (!receiverName) {
    throw new Error("Cliente/empresa receptor obligatorio");
  }

  const baseAmount = parseNumber(input.baseAmount ?? "0");
  const extrasAmount = 0;
  const insuranceAmount = 0;
  const penaltiesAmount = 0;
  const ivaPercent = parseNumber(input.ivaPercent ?? String(data.companySettings.defaultIvaPercent));
  const subtotal = baseAmount + extrasAmount + insuranceAmount + penaltiesAmount;
  const ivaAmount = (subtotal * ivaPercent) / 100;

  const requestedTypeRaw = String(input.invoiceType ?? "F").trim().toUpperCase();
  const requestedType = (["F", "V", "R", "A"] as const).includes(requestedTypeRaw as "F" | "V" | "R" | "A")
    ? (requestedTypeRaw as "F" | "V" | "R" | "A")
    : "F";
  const invoiceSeriesByType = data.companySettings.invoiceSeriesByType ?? { F: "F", V: "V", R: "R", A: "A" };
  const invoiceSeries = normalizeInvoiceSeries(invoiceSeriesByType[requestedType], requestedType);
  const counterScope = data.companySettings.invoiceNumberScope === "GLOBAL" ? "GLOBAL" : "BRANCH";
  const key = resolveInvoiceCounterKey({ scope: counterScope, branchCode, invoiceSeries });
  let invoiceCounter = (data.counters.invoiceByYearBranch[key] ?? 0) + 1;
  let invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  while (data.invoices.some((item) => item.invoiceNumber === invoiceNumberCandidate)) {
    invoiceCounter += 1;
    invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  }
  data.counters.invoiceByYearBranch[key] = invoiceCounter;

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    invoiceNumber: invoiceNumberCandidate,
    invoiceName,
    sourceType: "MANUAL",
    invoiceType: requestedType,
    contractId: null,
    sourceInvoiceId: null,
    issuedAt: `${issuedDate}T00:00:00`,
    baseAmount,
    extrasAmount,
    insuranceAmount,
    penaltiesAmount,
    ivaPercent,
    ivaAmount,
    totalAmount: subtotal + ivaAmount,
    manualCustomerName: receiverName,
    manualCustomerTaxId: (input.manualCustomerTaxId ?? "").trim(),
    manualCustomerAddress: (input.manualCustomerAddress ?? "").trim(),
    manualCustomerEmail: (input.manualCustomerEmail ?? "").trim(),
    manualLanguage: ((input.manualLanguage ?? "es").trim() || "es").toLowerCase(),
    status: "BORRADOR",
    finalizedAt: null,
    finalizedBy: "",
    sentLog: [],
  };

  data.invoices.push(invoice);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_manual_create",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, branchCode, totalAmount: invoice.totalAmount, invoiceType: requestedType, counterScope },
  });
  return invoice;
}

export async function finalizeInvoice(invoiceId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }
  if (invoice.status === "FINAL") {
    return invoice;
  }
  invoice.status = "FINAL";
  invoice.finalizedAt = new Date().toISOString();
  invoice.finalizedBy = actor.id;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_finalize",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber },
  });
  return invoice;
}

export async function createDerivedInvoiceFromSource(
  sourceInvoiceId: string,
  input: { invoiceType: "R" | "A"; issuedDate?: string; invoiceName?: string },
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const source = data.invoices.find((item) => item.id === sourceInvoiceId);
  if (!source) {
    throw new Error("Factura origen no encontrada");
  }
  const derivedType = input.invoiceType;
  const issuedAt = input.issuedDate && parseDateSafe(`${input.issuedDate}T00:00:00`)
    ? `${input.issuedDate}T00:00:00`
    : new Date().toISOString();

  const branchCodeFromSource =
    source.contractId
      ? data.contracts.find((contract) => contract.id === source.contractId)?.branchCode ?? "SUC-ND"
      : "SUC-ND";
  const invoiceSeriesByType = data.companySettings.invoiceSeriesByType ?? { F: "F", V: "V", R: "R", A: "A" };
  const invoiceSeries = normalizeInvoiceSeries(invoiceSeriesByType[derivedType], derivedType);
  const counterScope = data.companySettings.invoiceNumberScope === "GLOBAL" ? "GLOBAL" : "BRANCH";
  const key = resolveInvoiceCounterKey({ scope: counterScope, branchCode: branchCodeFromSource, invoiceSeries });
  let invoiceCounter = (data.counters.invoiceByYearBranch[key] ?? 0) + 1;
  let invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  while (data.invoices.some((item) => item.invoiceNumber === invoiceNumberCandidate)) {
    invoiceCounter += 1;
    invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  }
  data.counters.invoiceByYearBranch[key] = invoiceCounter;

  const invoice: Invoice = {
    ...source,
    id: crypto.randomUUID(),
    invoiceNumber: invoiceNumberCandidate,
    invoiceName:
      (input.invoiceName ?? "").trim() ||
      (derivedType === "R" ? `Rectificativa ${source.invoiceNumber}` : `Abono ${source.invoiceNumber}`),
    invoiceType: derivedType,
    sourceInvoiceId: source.id,
    issuedAt,
    status: "BORRADOR",
    finalizedAt: null,
    finalizedBy: "",
    sentLog: [],
  };

  data.invoices.push(invoice);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice_derived_create",
    entityId: invoice.id,
    details: { sourceInvoiceNumber: source.invoiceNumber, invoiceNumber: invoice.invoiceNumber, invoiceType: derivedType },
  });
  return invoice;
}

export async function listInvoiceSendLogs(input: { from: string; to: string }) {
  const invoices = await listInvoices("");
  return invoices
    .flatMap((invoice) =>
    invoice.sentLog
      .filter((log) => isInsideRange(log.sentAt, input.from, input.to))
      .map((log) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceName: invoice.invoiceName,
        sentAt: log.sentAt,
        sentBy: log.sentBy,
        to: log.to,
        status: log.status,
      })),
    )
    .toSorted((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function listExpenseJournal(input: { from: string; to: string; plate: string }) {
  const data = await readRentalData();
  const plate = input.plate.trim().toUpperCase();
  const rows = data.internalExpenses
    .filter((expense) => {
      if (!isInsideRange(`${expense.expenseDate}T12:00:00`, `${input.from}T00:00:00`, `${input.to}T23:59:59`)) {
        return false;
      }
      if (plate && !expense.vehiclePlate.toUpperCase().includes(plate)) {
        return false;
      }
      return true;
    })
    .map((expense) => {
      const meta = expense.contractId === "__DIARIO__" ? parseDailyExpenseMeta(expense.note) : { batchId: "", workerName: "" };
      return {
        expenseDate: expense.expenseDate,
        vehiclePlate: expense.vehiclePlate.toUpperCase(),
        category: expense.category,
        amount: expense.amount,
        note: expense.note,
        contractId: expense.contractId,
        sourceType: expense.contractId === "__DIARIO__" ? "DIARIO" : "CONTRATO",
        batchId: meta.batchId,
        workerName: meta.workerName,
      };
    })
    .toSorted((a, b) => {
      const byDate = b.expenseDate.localeCompare(a.expenseDate);
      if (byDate !== 0) return byDate;
      return a.vehiclePlate.localeCompare(b.vehiclePlate);
    });

  const totalExpenses = rows.reduce((sum, row) => sum + row.amount, 0);
  return { rows, totalExpenses };
}

export async function listContractClosureReconciliation(input: { from: string; to: string }) {
  const data = await readRentalData();
  return data.contracts
    .filter((contract) => contract.status === "CERRADO" && contract.closedAt)
    .filter((contract) => isInsideRange(contract.closedAt || "", `${input.from}T00:00:00`, `${input.to}T23:59:59`))
    .map((contract) => {
      const invoice = contract.invoiceId ? data.invoices.find((item) => item.id === contract.invoiceId) ?? null : null;
      return {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        closedAt: contract.closedAt || "",
        cashAmount: contract.cashRecord?.amount ?? 0,
        cashMethod: contract.cashRecord?.method ?? "N/D",
        invoiceNumber: invoice?.invoiceNumber ?? "N/D",
        invoiceTotal: invoice?.totalAmount ?? 0,
      };
    })
    .toSorted((a, b) => b.closedAt.localeCompare(a.closedAt));
}

// -------------------- Configuración empresa --------------------
export async function getCompanySettings() {
  noStore();
  const data = await readRentalData();
  return data.companySettings;
}

export async function updateCompanySettings(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const current = data.companySettings;
  const nowIso = new Date().toISOString();

  const branches = has("branchesRaw")
    ? (() => {
        const raw = (input.branchesRaw ?? "").trim();
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            return parsed
              .map((item, index) => {
                if (!item || typeof item !== "object") return null;
                const branch = item as Partial<CompanyBranch>;
                const code = normalizeBranchCode(String(branch.code ?? ""));
                const name = String(branch.name ?? "").trim() || "N/D";
                if (!code || !name) return null;
                const idValue = Number(branch.id);
                const counterValue = Number(branch.contractCounterStart);
                return {
                  id: Number.isFinite(idValue) && idValue > 0 ? Math.floor(idValue) : index + 1,
                  code,
                  name,
                  contractCounterStart: Number.isFinite(counterValue) && counterValue >= 0 ? Math.floor(counterValue) : 0,
                  address: String(branch.address ?? "").trim(),
                  postalCode: String(branch.postalCode ?? "").trim(),
                  municipality: String(branch.municipality ?? "").trim(),
                  province: String(branch.province ?? "").trim(),
                  country: String(branch.country ?? "").trim(),
                  phone: String(branch.phone ?? "").trim(),
                  mobile: String(branch.mobile ?? "").trim(),
                  email: String(branch.email ?? "").trim(),
                  active: branch.active !== false,
                };
              })
              .filter((branch): branch is CompanyBranch => branch !== null)
              .toSorted((a, b) => a.id - b.id || a.code.localeCompare(b.code));
          }
        } catch {
          // Compatibilidad con el formato histórico ID|CODIGO|NOMBRE|CONTADOR
        }

        return raw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => {
            const parts = line.split("|");
            const hasExplicitId = parts.length >= 3;
            const rawId = hasExplicitId ? Number(parts[0]) : index + 1;
            const code = hasExplicitId ? parts[1] : parts[0];
            const rest = hasExplicitId ? parts.slice(2) : parts.slice(1);
            const rawContractCounterStart = Number(rest[rest.length - 1] ?? "0");
            const hasContractCounterStart = hasExplicitId && rest.length >= 2 && Number.isFinite(rawContractCounterStart);
            const nameParts = hasContractCounterStart ? rest.slice(0, -1) : rest;
            return {
              id: Number.isFinite(rawId) && rawId > 0 ? Math.floor(rawId) : index + 1,
              code: normalizeBranchCode(code ?? ""),
              name: nameParts.join("|").trim() || "N/D",
              contractCounterStart: hasContractCounterStart && rawContractCounterStart >= 0 ? Math.floor(rawContractCounterStart) : 0,
              address: "",
              postalCode: "",
              municipality: "",
              province: "",
              country: "",
              phone: "",
              mobile: "",
              email: "",
              active: true,
            };
          })
          .toSorted((a, b) => a.id - b.id || a.code.localeCompare(b.code));
      })()
    : (current.branches ?? []).toSorted((a, b) => a.id - b.id || a.code.localeCompare(b.code));
  const providers = has("providersRaw")
    ? Array.from(
        new Set(
          (input.providersRaw ?? "")
            .trim()
            .split("\n")
            .map((line) => normalizeOwnerName(line))
            .filter(Boolean),
        ),
      )
    : (current.providers ?? []);
  const normalizeHex = (value: string, fallback: string) => {
    const cleaned = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned : fallback;
  };
  const nextCompanyName = has("companyName") ? ((input.companyName ?? "N/D").trim() || "N/D") : current.companyName;
  const branchSchedules = has("branchSchedulesRaw")
    ? (() => {
        try {
          const parsed = JSON.parse(input.branchSchedulesRaw ?? "{}") as unknown;
          return normalizeBranchSchedules(parsed, current.branchSchedules ?? {}, nowIso, actor.id);
        } catch {
          return current.branchSchedules ?? {};
        }
      })()
    : (current.branchSchedules ?? {});

  data.companySettings = {
    companyName: nextCompanyName,
    legalName: has("legalName") ? ((input.legalName ?? "N/D").trim() || "N/D") : current.legalName,
    documentBrandName: has("documentBrandName")
      ? ((input.documentBrandName ?? "").trim() || nextCompanyName)
      : (current.documentBrandName || nextCompanyName),
    companyEmailFrom: has("companyEmailFrom") ? ((input.companyEmailFrom ?? "N/D").trim() || "N/D") : current.companyEmailFrom,
    companyPhone: has("companyPhone") ? ((input.companyPhone ?? "N/D").trim() || "N/D") : current.companyPhone,
    companyWebsite: has("companyWebsite") ? ((input.companyWebsite ?? "N/D").trim() || "N/D") : current.companyWebsite,
    taxId: has("taxId") ? ((input.taxId ?? "N/D").trim() || "N/D") : current.taxId,
    fiscalAddress: has("fiscalAddress") ? ((input.fiscalAddress ?? "N/D").trim() || "N/D") : current.fiscalAddress,
    documentFooter: has("documentFooter") ? (input.documentFooter ?? "").trim() : (current.documentFooter ?? ""),
    contractFrontFooter: has("contractFrontFooter")
      ? (input.contractFrontFooter ?? "").trim()
      : (current.contractFrontFooter ?? current.documentFooter ?? ""),
    contractBackContent: has("contractBackContent") ? (input.contractBackContent ?? "").trim() : (current.contractBackContent ?? ""),
    contractBackContentType: has("contractBackContentType")
      ? ((input.contractBackContentType ?? "").trim().toUpperCase() === "HTML" ? "HTML" : "TEXT")
      : (current.contractBackContentType ?? "TEXT"),
    contractBackLayout:
      has("contractBackLayout") && String(input.contractBackLayout ?? "").trim().toUpperCase() === "DUAL" ? "DUAL" : (current.contractBackLayout ?? "SINGLE"),
    contractBackFontSize: has("contractBackFontSize")
      ? Math.min(12, Math.max(5.5, parseNumber(input.contractBackFontSize ?? String(current.contractBackFontSize ?? 7.6))))
      : Math.min(12, Math.max(5.5, parseNumber(String(current.contractBackFontSize ?? 7.6)))),
    contractBackContentEs: has("contractBackContentEs")
      ? (input.contractBackContentEs ?? "").trim()
      : (current.contractBackContentEs ?? ""),
    contractBackContentEn: has("contractBackContentEn")
      ? (input.contractBackContentEn ?? "").trim()
      : (current.contractBackContentEn ?? ""),
    logoDataUrl: has("logoDataUrl") ? (input.logoDataUrl ?? "").trim() : (current.logoDataUrl ?? ""),
    brandPrimaryColor: has("brandPrimaryColor")
      ? normalizeHex(input.brandPrimaryColor ?? "", "#2563eb")
      : normalizeHex(current.brandPrimaryColor ?? "", "#2563eb"),
    brandSecondaryColor: has("brandSecondaryColor")
      ? normalizeHex(input.brandSecondaryColor ?? "", "#0f172a")
      : normalizeHex(current.brandSecondaryColor ?? "", "#0f172a"),
    defaultIvaPercent: has("defaultIvaPercent")
      ? parseNumber(input.defaultIvaPercent ?? String(current.defaultIvaPercent))
      : current.defaultIvaPercent,
    courtesyHours: has("courtesyHours")
      ? Math.max(0, Math.floor(parseNumber(input.courtesyHours ?? String(current.courtesyHours ?? 0))))
      : Math.max(0, Math.floor(parseNumber(String(current.courtesyHours ?? 0)))),
    salesChannels: current.salesChannels ?? [],
    providers,
    backupRetentionDays: has("backupRetentionDays")
      ? Math.max(1, Math.floor(parseNumber(input.backupRetentionDays ?? String(current.backupRetentionDays ?? 90))))
      : Math.max(1, Math.floor(parseNumber(String(current.backupRetentionDays ?? 90)))),
    invoiceSeriesByType: {
      F: has("invoiceSeriesF") ? normalizeInvoiceSeries(input.invoiceSeriesF ?? current.invoiceSeriesByType.F, "F") : current.invoiceSeriesByType.F,
      R: has("invoiceSeriesR") ? normalizeInvoiceSeries(input.invoiceSeriesR ?? current.invoiceSeriesByType.R, "R") : current.invoiceSeriesByType.R,
      V: has("invoiceSeriesV") ? normalizeInvoiceSeries(input.invoiceSeriesV ?? current.invoiceSeriesByType.V, "V") : current.invoiceSeriesByType.V,
      A: has("invoiceSeriesA") ? normalizeInvoiceSeries(input.invoiceSeriesA ?? current.invoiceSeriesByType.A, "A") : current.invoiceSeriesByType.A,
    },
    invoiceNumberScope:
      has("invoiceNumberScope") && String(input.invoiceNumberScope ?? "").toUpperCase() === "GLOBAL" ? "GLOBAL" : "BRANCH",
    branches,
    branchSchedules,
    contractNumberPattern: "aa-id-numero",
    invoiceNumberPattern:
      has("invoiceNumberScope") && String(input.invoiceNumberScope ?? "").toUpperCase() === "GLOBAL"
        ? "serie-digitos-global"
        : "serie-digitos-sucursal",
    updatedAt: nowIso,
    updatedBy: actor.id,
  };

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "company_settings",
    entityId: "default",
    details: { updatedBy: actor.id, branches: data.companySettings.branches.length },
  });
}

// -------------------- Usuarios --------------------
function normalizeUserRole(input: string): RoleName {
  const role = input.trim().toUpperCase();
  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "LECTOR") {
    return role;
  }
  return "LECTOR";
}

function normalizeUserEmail(input: string): string {
  return input.trim().toLowerCase();
}

export async function listUserAccounts(query = ""): Promise<UserAccount[]> {
  const data = await readRentalData();
  const q = query.trim().toLowerCase();
  const rows = data.users
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      ...item,
      password: "",
    }));
  if (!q) return rows;
  return rows.filter((item) => [item.name, item.email, item.role].join(" ").toLowerCase().includes(q));
}

export async function createUserAccount(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const email = normalizeUserEmail(input.email ?? "");
  const name = (input.name ?? "").trim();
  const password = (input.password ?? "").trim();
  const role = normalizeUserRole(input.role ?? "LECTOR");
  const active = String(input.active ?? "true") !== "false";

  if (!name) throw new Error("Nombre obligatorio");
  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (!password) throw new Error("Password obligatorio");
  if (data.users.some((item) => normalizeUserEmail(item.email) === email)) {
    throw new Error("Ya existe un usuario con ese email");
  }

  const now = new Date().toISOString();
  const created: UserAccount = {
    id: `usr-${String(data.users.length + 1).padStart(4, "0")}`,
    name,
    email,
    password,
    role,
    active,
    createdAt: now,
    createdBy: actor.id,
    updatedAt: now,
    updatedBy: actor.id,
  };
  data.users.push(created);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: now,
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "user_account",
    entityId: created.id,
    details: { mode: "CREATE", email: created.email, role: created.role, active: created.active },
  });
}

export async function updateUserAccount(userId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("Usuario no encontrado");

  const nextEmail = normalizeUserEmail(input.email ?? user.email);
  if (!nextEmail || !nextEmail.includes("@")) throw new Error("Email inválido");
  if (data.users.some((item) => item.id !== userId && normalizeUserEmail(item.email) === nextEmail)) {
    throw new Error("Ya existe un usuario con ese email");
  }

  user.name = (input.name ?? user.name).trim() || user.name;
  user.email = nextEmail;
  user.role = normalizeUserRole(input.role ?? user.role);
  const nextPassword = (input.password ?? "").trim();
  if (nextPassword) user.password = nextPassword;
  if (Object.prototype.hasOwnProperty.call(input, "active")) {
    user.active = String(input.active ?? "true") !== "false";
  }
  user.updatedAt = new Date().toISOString();
  user.updatedBy = actor.id;

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: user.updatedAt,
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "user_account",
    entityId: user.id,
    details: { mode: "UPDATE", email: user.email, role: user.role, active: user.active },
  });
}

export async function setUserAccountActive(userId: string, active: boolean, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("Usuario no encontrado");
  user.active = active;
  user.updatedAt = new Date().toISOString();
  user.updatedBy = actor.id;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: user.updatedAt,
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "user_account",
    entityId: user.id,
    details: { mode: active ? "ACTIVATE" : "DEACTIVATE", email: user.email },
  });
}

export async function changeOwnUserPassword(
  userId: string,
  input: { currentPassword: string; nextPassword: string; confirmPassword: string },
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const user = data.users.find((item) => item.id === userId && item.active);
  if (!user) throw new Error("Usuario no encontrado");

  const currentPassword = input.currentPassword.trim();
  const nextPassword = input.nextPassword.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (!currentPassword) throw new Error("Debes indicar la contraseña actual");
  if (user.password !== currentPassword) throw new Error("La contraseña actual no es correcta");
  if (!nextPassword) throw new Error("Debes indicar una nueva contraseña");
  if (nextPassword.length < 8) throw new Error("La nueva contraseña debe tener al menos 8 caracteres");
  if (nextPassword !== confirmPassword) throw new Error("La confirmación de contraseña no coincide");

  user.password = nextPassword;
  user.updatedAt = new Date().toISOString();
  user.updatedBy = actor.id;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: user.updatedAt,
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "user_account_password",
    entityId: user.id,
    details: { mode: "CHANGE_SELF" },
  });
}

export async function requestUserPasswordRecovery(emailInput: string) {
  const data = await readRentalData();
  const email = normalizeUserEmail(emailInput);
  if (!email) return;
  const user = data.users.find((item) => item.active && normalizeUserEmail(item.email) === email);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: user?.id ?? "anonymous",
    actorRole: user?.role ?? "LECTOR",
    entity: "user_account_password",
    entityId: user?.id ?? email,
    details: {
      mode: "RECOVERY_REQUEST",
      email,
      found: Boolean(user),
    },
  });
}

export async function deleteUserAccount(userId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw new Error("Usuario no encontrado");
  data.users = data.users.filter((item) => item.id !== userId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "user_account",
    entityId: userId,
    details: { mode: "DELETE", email: user.email, role: user.role },
  });
}

// -------------------- Reservas y asignación de vehículo --------------------
export async function createReservation(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const inputCustomerId = (input.customerId ?? "").trim();
  const client = inputCustomerId
    ? data.clients.find((item) => item.id === inputCustomerId || item.clientCode.trim().toUpperCase() === inputCustomerId.toUpperCase()) ?? null
    : null;
  const billedCarGroup = input.billedCarGroup?.trim() ?? "";
  const appliedRate = (input.appliedRate ?? "").trim().toUpperCase();
  const plansByCode = appliedRate ? data.tariffPlans.filter((item) => item.code.toUpperCase() === appliedRate.toUpperCase()) : [];
  const courtesyHours = getGlobalCourtesyHours(data.companySettings);
  const billedDays = computeBilledDaysBy24h(input.deliveryAt?.trim() ?? "", input.pickupAt?.trim() ?? "", courtesyHours);
  let baseAmount = parseNumber(input.baseAmount ?? "0");
  let computedTariff: TariffComputationResult | null = null;
  if (baseAmount <= 0 && appliedRate && billedCarGroup && billedDays > 0) {
    const computed = calculateTariffAmountFromPlans({
      data,
      plans: plansByCode,
      groupCode: billedCarGroup,
      billedDays,
      deliveryAt: input.deliveryAt?.trim() ?? "",
      pickupAt: input.pickupAt?.trim() ?? "",
      courtesyHours,
    });
    if (computed.found) {
      baseAmount = computed.amount;
      computedTariff = computed;
    }
  }
  const resolvedAppliedRate =
    appliedRate === SPECIAL_RATE_CODE_MANUAL
      ? SPECIAL_RATE_CODE_MANUAL
      : computedTariff?.isSeasonSplit
        ? SPECIAL_RATE_CODE_SEASON_CROSS
        : appliedRate;
  const selectedDiscountsPayload = parseSelectedDiscountsPayload(String(input.selectedDiscountsPayload ?? ""));
  const selectedExtrasPayload = parseSelectedExtrasPayload(String(input.selectedExtrasPayload ?? ""));
  const selectedInsurancePayload = parseSelectedExtrasPayload(String(input.selectedInsurancePayload ?? ""));
  const computedDiscount = calculateDiscountsFromSelection({
    selected: selectedDiscountsPayload,
    baseAmount,
    fallbackAmount: parseNumber(input.discountAmount ?? "0"),
    fallbackBreakdown: input.discountBreakdown?.trim() ?? "",
  });
  const discountAmount = computedDiscount.amount;
  const computedExtras = calculateExtrasFromSelection(
    {
      selected: selectedExtrasPayload,
      billedDays,
      fallbackAmount: parseNumber(input.extrasAmount ?? "0"),
      fallbackBreakdown: input.extrasBreakdown?.trim() ?? "",
    },
    data.vehicleExtras.filter((item) => item.kind === "EXTRA"),
  );
  const extrasAmount = computedExtras.amount;
  const fuelAmount = parseNumber(input.fuelAmount ?? "0");
  const computedInsurance = calculateExtrasFromSelection(
    {
      selected: selectedInsurancePayload,
      billedDays,
      fallbackAmount: parseNumber(input.insuranceAmount ?? "0"),
      fallbackBreakdown: "",
    },
    data.vehicleExtras.filter((item) => item.kind === "SEGURO"),
  );
  const insuranceAmount = computedInsurance.amount;
  const penaltiesAmount = parseNumber(input.penaltiesAmount ?? "0");
  const calculatedTotal = calculateReservationTotal({
    baseAmount,
    discountAmount,
    extrasAmount,
    fuelAmount,
    insuranceAmount,
    penaltiesAmount,
  });
  const submittedTotal = parseNumber(input.totalPrice ?? "0");
  // Si no llega total explícito, se calcula en backend con los componentes.
  const totalPrice = submittedTotal !== 0 ? submittedTotal : calculatedTotal;
  const priceBreakdown = [
    `base:${formatMoney(baseAmount)}`,
    `descuento:${formatMoney(discountAmount)}`,
    `extras:${formatMoney(extrasAmount)}`,
    `combustible:${formatMoney(fuelAmount)}`,
    `cdw:${formatMoney(insuranceAmount)}`,
    `extension:${formatMoney(penaltiesAmount)}`,
    `total:${formatMoney(totalPrice)}`,
  ].join(", ");

  const branchCode = normalizeBranchCode(input.branchDelivery ?? "");
  const year = getYear(input.deliveryAt ?? new Date().toISOString());
  data.counters.reservation += 1;
  const reservationNumber = `RSV-${year}-${String(data.counters.reservation).padStart(6, "0")}`;

  const reservation: Reservation = {
    id: crypto.randomUUID(),
    reservationNumber,
    seriesCode: (input.seriesCode ?? "01").trim() || "01",
    docType: (input.docType ?? "RESERVA").trim() || "RESERVA",
    contractType: (input.contractType ?? "STANDARD").trim() || "STANDARD",
    billingAccountCode: (input.billingAccountCode ?? "").trim(),
    commissionAccountCode: (input.commissionAccountCode ?? "").trim(),
    clientAccountCode: (input.clientAccountCode ?? "").trim(),
    voucherNumber: (input.voucherNumber ?? "").trim(),
    branchDelivery: input.branchDelivery?.trim() ?? "",
    customerName:
      input.customerName?.trim() ||
      [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() ||
      client?.companyName ||
      "",
    customerCompany: input.customerCompany?.trim() || client?.companyName || "",
    customerCommissioner: input.customerCommissioner?.trim() || client?.commissionerName || "",
    deliveryPlace: input.deliveryPlace?.trim() ?? "",
    deliveryAt: input.deliveryAt?.trim() ?? "",
    pickupBranch: input.pickupBranch?.trim() ?? "",
    pickupPlace: input.pickupPlace?.trim() ?? "",
    pickupAt: input.pickupAt?.trim() ?? "",
    deliveryFlightNumber: input.deliveryFlightNumber?.trim() ?? "",
    pickupFlightNumber: input.pickupFlightNumber?.trim() ?? "",
    billedCarGroup,
    modelRequested: (input.modelRequested ?? "").trim(),
    assignedPlate: input.assignedPlate?.trim().toUpperCase() ?? "",
    vehicleKeyCode: (input.vehicleKeyCode ?? "").trim(),
    billedDays,
    billedGroupOverride: (input.billedGroupOverride ?? "").trim(),
    assignedVehicleGroup: (input.assignedVehicleGroup ?? "").trim(),
    priceBreakdown,
    extrasBreakdown: computedExtras.breakdown,
    discountBreakdown: computedDiscount.breakdown,
    baseAmount,
    discountAmount,
    extrasAmount,
    fuelAmount,
    insuranceAmount,
    penaltiesAmount,
    fuelPolicy: input.fuelPolicy?.trim() ?? "",
    additionalDrivers: input.additionalDrivers?.trim() ?? "",
    appliedRate: resolvedAppliedRate,
    publicNotes: input.publicNotes?.trim() ?? "",
    privateNotes: input.privateNotes?.trim() ?? "",
    deductible: input.deductible?.trim() ?? "",
    depositAmount: parseNumber(input.depositAmount ?? "0"),
    privateObservations: (input.privateObservations ?? "").trim(),
    publicObservations: (input.publicObservations ?? "").trim(),
    referenceCode: (input.referenceCode ?? "").trim(),
    dnhcCode: (input.dnhcCode ?? "").trim(),
    blockPlateForReservation: input.blockPlateForReservation === "true",
    paymentsMade: parseNumber(input.paymentsMade ?? "0"),
    totalPrice,
    salesChannel: input.salesChannel?.trim() || client?.acquisitionChannel || "",
    ivaPercent: input.ivaPercent ? parseNumber(input.ivaPercent) : data.companySettings.defaultIvaPercent,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    contractId: null,
    reservationStatus: input.reservationStatus === "PETICION" ? "PETICION" : "CONFIRMADA",
    groupOverrideAccepted: false,
    groupOverrideReason: "",
    groupOverridePriceAdjustment: 0,
    groupOverridePriceAdjustedAt: "",
    confirmationSentLog: [],
    customerId: client?.id ?? null,
  };

  if (!reservation.customerName || !reservation.deliveryAt || !reservation.pickupAt || !reservation.branchDelivery) {
    throw new Error("Faltan campos obligatorios de reserva");
  }
  if (!reservation.billedDays) {
    reservation.billedDays = computeBilledDaysBy24h(reservation.deliveryAt, reservation.pickupAt, courtesyHours);
  }

  if (!reservation.assignedPlate && reservation.billedCarGroup && reservation.deliveryAt && reservation.pickupAt) {
    const autoPlate = findFirstAvailablePlateForGroup(data, {
      requestedGroup: reservation.billedCarGroup,
      startAt: reservation.deliveryAt,
      endAt: reservation.pickupAt,
    });
    if (autoPlate) {
      reservation.assignedPlate = autoPlate;
      const autoVehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === autoPlate) ?? null;
      const autoCategory = autoVehicle ? data.vehicleCategories.find((item) => item.id === autoVehicle.categoryId) ?? null : null;
      reservation.assignedVehicleGroup = autoCategory?.code || autoCategory?.name || reservation.assignedVehicleGroup;
      await appendAuditEvent({
        timestamp: new Date().toISOString(),
        action: "SYSTEM",
        actorId: actor.id,
        actorRole: actor.role,
        entity: "reservation_auto_assignment",
        entityId: reservation.id,
        details: { reservationNumber, assignedPlate: autoPlate, billedCarGroup: reservation.billedCarGroup },
      });
    }
  }

  if (reservation.assignedPlate) {
    const assignedCheck = ensureAssignedPlateAvailabilityForReservation({
      assignedPlate: reservation.assignedPlate,
      deliveryAt: reservation.deliveryAt,
      fleetVehicles: data.fleetVehicles,
    });
    if (assignedCheck.found && assignedCheck.vehicle) {
      const vehicleCategory = data.vehicleCategories.find((item) => item.id === assignedCheck.vehicle.categoryId);
      reservation.assignedVehicleGroup = vehicleCategory?.code || vehicleCategory?.name || "";
      if (assignedCheck.warningLimit) {
        await appendAuditEvent({
          timestamp: new Date().toISOString(),
          action: "SYSTEM",
          actorId: actor.id,
          actorRole: actor.role,
          entity: "reservation_vehicle_limit_warning",
          entityId: reservation.id,
          details: {
            reservationNumber,
            plate: reservation.assignedPlate,
            activeUntil: assignedCheck.vehicle.activeUntil,
            deliveryAt: reservation.deliveryAt,
          },
        });
      }
    }
  }

  data.reservations.push(reservation);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "reservation",
    entityId: reservation.id,
    details: { reservationNumber, branchCode },
  });

  if (reservation.reservationStatus === "CONFIRMADA") {
    const toEmail = (client?.email ?? "").trim();
    if (!toEmail) {
      await appendAuditEvent({
        timestamp: new Date().toISOString(),
        action: "SYSTEM",
        actorId: actor.id,
        actorRole: actor.role,
        entity: "reservation_confirmation",
        entityId: reservation.id,
        details: {
          reservationNumber,
          mode: "auto_on_create",
          status: "ERROR",
          failureReason: "Cliente sin email",
        },
      });
      return;
    }
    const mailFrom = data.companySettings.companyEmailFrom !== "N/D" ? data.companySettings.companyEmailFrom : undefined;
    const templateHtml = resolveReservationConfirmationTemplateHtml(data.templates, client?.language || "es");
    try {
      await sendMailFromCompany({
        fromOverride: mailFrom,
        to: toEmail,
        subject: `Confirmacion reserva ${reservation.reservationNumber}`,
        html: buildReservationConfirmationHtml(reservation, {
          companyName: getDocumentCompanyName(data.companySettings),
          taxId: data.companySettings.taxId,
          fiscalAddress: data.companySettings.fiscalAddress,
          logoDataUrl: data.companySettings.logoDataUrl,
          companyEmailFrom: data.companySettings.companyEmailFrom,
          companyPhone: data.companySettings.companyPhone,
          companyWebsite: data.companySettings.companyWebsite,
          companyFooter: data.companySettings.documentFooter,
          brandPrimaryColor: data.companySettings.brandPrimaryColor,
          brandSecondaryColor: data.companySettings.brandSecondaryColor,
          customer: client ?? null,
          language: client?.language || "es",
          templateHtml,
        }),
      });
      reservation.confirmationSentLog.push({
        sentAt: new Date().toISOString(),
        sentBy: actor.id,
        to: toEmail,
        status: "ENVIADA",
      });
      await writeRentalData(data);
    } catch (error) {
      await appendAuditEvent({
        timestamp: new Date().toISOString(),
        action: "SYSTEM",
        actorId: actor.id,
        actorRole: actor.role,
        entity: "reservation_confirmation",
        entityId: reservation.id,
        details: {
          reservationNumber,
          mode: "auto_on_create",
          status: "ERROR",
          toEmail,
          failureReason: error instanceof Error ? error.message : "Fallo SMTP",
        },
      });
      return;
    }
  }

  if (reservation.reservationStatus === "CONFIRMADA" && reservation.confirmationSentLog.length > 0) {
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "reservation_confirmation",
      entityId: reservation.id,
      details: { reservationNumber, toEmail: reservation.confirmationSentLog[0].to, mode: "auto_on_create" },
    });
  }
}

export async function updateReservation(
  reservationId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  const before = reservationAuditSnapshot(reservation);

  reservation.customerName = (input.customerName ?? reservation.customerName).trim();
  reservation.branchDelivery = (input.branchDelivery ?? reservation.branchDelivery).trim();
  reservation.deliveryPlace = (input.deliveryPlace ?? reservation.deliveryPlace).trim();
  reservation.deliveryAt = (input.deliveryAt ?? reservation.deliveryAt).trim();
  reservation.pickupBranch = (input.pickupBranch ?? reservation.pickupBranch).trim();
  reservation.pickupPlace = (input.pickupPlace ?? reservation.pickupPlace).trim();
  reservation.pickupAt = (input.pickupAt ?? reservation.pickupAt).trim();
  reservation.billedCarGroup = (input.billedCarGroup ?? reservation.billedCarGroup).trim();
  reservation.appliedRate = (input.appliedRate ?? reservation.appliedRate).trim().toUpperCase();
  const courtesyHours = getGlobalCourtesyHours(data.companySettings);
  reservation.billedDays = computeBilledDaysBy24h(
    reservation.deliveryAt,
    reservation.pickupAt,
    courtesyHours,
  );
  reservation.assignedPlate = (input.assignedPlate ?? reservation.assignedPlate).trim().toUpperCase();
  reservation.assignedVehicleGroup = (input.assignedVehicleGroup ?? reservation.assignedVehicleGroup).trim();
  if (Object.prototype.hasOwnProperty.call(input, "blockPlateForReservation")) {
    reservation.blockPlateForReservation = input.blockPlateForReservation === "true";
  }
  reservation.publicNotes = (input.publicNotes ?? reservation.publicNotes).trim();
  reservation.privateNotes = (input.privateNotes ?? reservation.privateNotes).trim();
  reservation.reservationStatus = input.reservationStatus === "PETICION" ? "PETICION" : "CONFIRMADA";
  const selectedExtrasPayload = parseSelectedExtrasPayload(String(input.selectedExtrasPayload ?? ""));
  const selectedInsurancePayload = parseSelectedExtrasPayload(String(input.selectedInsurancePayload ?? ""));
  const computedExtras = calculateExtrasFromSelection(
    {
      selected: selectedExtrasPayload,
      billedDays: reservation.billedDays || 1,
      fallbackAmount: parseNumber(input.extrasAmount ?? String(reservation.extrasAmount)),
      fallbackBreakdown: (input.extrasBreakdown ?? reservation.extrasBreakdown).trim(),
    },
    data.vehicleExtras.filter((item) => item.kind === "EXTRA"),
  );
  const computedInsurance = calculateExtrasFromSelection(
    {
      selected: selectedInsurancePayload,
      billedDays: reservation.billedDays || 1,
      fallbackAmount: parseNumber(input.insuranceAmount ?? String(reservation.insuranceAmount)),
      fallbackBreakdown: "",
    },
    data.vehicleExtras.filter((item) => item.kind === "SEGURO"),
  );
  reservation.extrasAmount = computedExtras.amount;
  reservation.extrasBreakdown = computedExtras.breakdown;
  reservation.baseAmount = input.baseAmount ? parseNumber(input.baseAmount) : reservation.baseAmount;
  if (reservation.appliedRate !== SPECIAL_RATE_CODE_MANUAL) {
    const plansByCode = reservation.appliedRate
      ? data.tariffPlans.filter((item) => item.code.toUpperCase() === reservation.appliedRate.toUpperCase())
      : [];
    if (plansByCode.length > 0 && reservation.billedCarGroup && reservation.billedDays > 0) {
      const computedTariff = calculateTariffAmountFromPlans({
        data,
        plans: plansByCode,
        groupCode: reservation.billedCarGroup,
        billedDays: reservation.billedDays,
        deliveryAt: reservation.deliveryAt,
        pickupAt: reservation.pickupAt,
        courtesyHours,
      });
      if (computedTariff.found) {
        reservation.appliedRate = computedTariff.isSeasonSplit ? SPECIAL_RATE_CODE_SEASON_CROSS : reservation.appliedRate;
      }
    }
  }
  const computedDiscount = calculateDiscountsFromSelection({
    selected: parseSelectedDiscountsPayload(String(input.selectedDiscountsPayload ?? "")),
    baseAmount: reservation.baseAmount,
    fallbackAmount: input.discountAmount ? parseNumber(input.discountAmount) : reservation.discountAmount,
    fallbackBreakdown: (input.discountBreakdown ?? reservation.discountBreakdown).trim(),
  });
  reservation.discountAmount = computedDiscount.amount;
  reservation.discountBreakdown = computedDiscount.breakdown;
  reservation.fuelAmount = input.fuelAmount ? parseNumber(input.fuelAmount) : reservation.fuelAmount;
  reservation.insuranceAmount = computedInsurance.amount;
  reservation.penaltiesAmount = input.penaltiesAmount ? parseNumber(input.penaltiesAmount) : reservation.penaltiesAmount;
  const totalCalculated = calculateReservationTotal({
    baseAmount: reservation.baseAmount,
    discountAmount: reservation.discountAmount,
    extrasAmount: reservation.extrasAmount,
    fuelAmount: reservation.fuelAmount,
    insuranceAmount: reservation.insuranceAmount,
    penaltiesAmount: reservation.penaltiesAmount,
  });
  reservation.totalPrice = input.totalPrice ? parseNumber(input.totalPrice) : totalCalculated;
  reservation.priceBreakdown = [
    `base:${formatMoney(reservation.baseAmount)}`,
    `descuento:${formatMoney(reservation.discountAmount)}`,
    `extras:${formatMoney(reservation.extrasAmount)}`,
    `combustible:${formatMoney(reservation.fuelAmount)}`,
    `cdw:${formatMoney(reservation.insuranceAmount)}`,
    `extension:${formatMoney(reservation.penaltiesAmount)}`,
    `total:${formatMoney(reservation.totalPrice)}`,
  ].join(", ");

  if (reservation.assignedPlate) {
    const assignedCheck = ensureAssignedPlateAvailabilityForReservation({
      assignedPlate: reservation.assignedPlate,
      deliveryAt: reservation.deliveryAt,
      fleetVehicles: data.fleetVehicles,
    });
    if (assignedCheck.warningLimit && assignedCheck.vehicle) {
      await appendAuditEvent({
        timestamp: new Date().toISOString(),
        action: "SYSTEM",
        actorId: actor.id,
        actorRole: actor.role,
        entity: "reservation_vehicle_limit_warning",
        entityId: reservation.id,
        details: {
          reservationNumber: reservation.reservationNumber,
          plate: reservation.assignedPlate,
          activeUntil: assignedCheck.vehicle.activeUntil,
          deliveryAt: reservation.deliveryAt,
        },
      });
    }
  }

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "reservation_update",
    entityId: reservation.id,
    details: {
      reservationNumber: reservation.reservationNumber,
      before,
      after: reservationAuditSnapshot(reservation),
    },
  });
}

export async function deleteReservation(reservationId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  if (reservation.contractId || data.contracts.some((item) => item.reservationId === reservationId)) {
    throw new Error("No se puede borrar una reserva con contrato asociado");
  }
  data.reservations = data.reservations.filter((item) => item.id !== reservationId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "reservation_delete",
    entityId: reservationId,
    details: { reservationNumber: reservation.reservationNumber },
  });
}

export async function assignPlateToReservation(
  reservationId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  const before = reservationAuditSnapshot(reservation);

  const plate = (input.assignedPlate ?? "").trim().toUpperCase();
  if (!plate) {
    throw new Error("Matrícula obligatoria");
  }
  const vehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === plate);
  const vehicleCategory = vehicle ? data.vehicleCategories.find((item) => item.id === vehicle.categoryId) : null;
  const assignedVehicleGroup = vehicleCategory?.code || vehicleCategory?.name || "";
  const billedGroup = reservation.billedCarGroup.trim().toUpperCase();
  const assignedGroupNormalized = assignedVehicleGroup.trim().toUpperCase();
  const crossGroupAssignment = Boolean(billedGroup && assignedGroupNormalized && billedGroup !== assignedGroupNormalized);

  // Conflictos por solape contra otras reservas y bloqueos manuales.
  const overlappingReservations = data.reservations.filter((item) => {
    if (item.id === reservation.id || !item.assignedPlate) {
      return false;
    }
    return (
      item.assignedPlate.toUpperCase() === plate &&
      hasOverlap(item.deliveryAt, item.pickupAt, reservation.deliveryAt, reservation.pickupAt)
    );
  });

  const overlappingBlocks = data.vehicleBlocks.filter(
    (block) =>
      block.vehiclePlate.toUpperCase() === plate &&
      hasOverlap(block.startAt, block.endAt, reservation.deliveryAt, reservation.pickupAt),
  );

  const hasConflicts = overlappingReservations.length > 0 || overlappingBlocks.length > 0;
  const overrideAccepted = input.overrideAccepted === "true";
  const overrideReason = (input.overrideReason ?? "").trim();
  const groupOverrideAccepted = input.groupOverrideAccepted === "true";
  const groupOverrideReason = (input.groupOverrideReason ?? "").trim();
  const applyPriceAdjustment = input.applyPriceAdjustment === "true";
  const priceAdjustmentAmount = parseNumber(input.priceAdjustmentAmount ?? "0");

  if (hasConflicts && !overrideAccepted) {
    throw new Error("Conflicto de solape detectado. Debes confirmar override.");
  }
  if (hasConflicts && overrideAccepted && !overrideReason) {
    throw new Error("Debes indicar motivo de override por solape");
  }
  if (crossGroupAssignment && !groupOverrideAccepted) {
    throw new Error("Vehículo de grupo diferente. Debes confirmar ajuste por cambio de grupo.");
  }
  if (crossGroupAssignment && groupOverrideAccepted && !groupOverrideReason) {
    throw new Error("Debes indicar motivo por cambio de grupo");
  }

  reservation.assignedPlate = plate;
  reservation.assignedVehicleGroup = assignedVehicleGroup;
  reservation.groupOverrideAccepted = crossGroupAssignment ? groupOverrideAccepted : false;
  reservation.groupOverrideReason = crossGroupAssignment ? groupOverrideReason : "";
  if (crossGroupAssignment && applyPriceAdjustment && priceAdjustmentAmount !== 0) {
    reservation.groupOverridePriceAdjustment += priceAdjustmentAmount;
    reservation.totalPrice += priceAdjustmentAmount;
    reservation.groupOverridePriceAdjustedAt = new Date().toISOString();
    reservation.priceBreakdown = [
      reservation.priceBreakdown,
      `ajuste_grupo:${formatMoney(priceAdjustmentAmount)}`,
      `total_actualizado:${formatMoney(reservation.totalPrice)}`,
    ]
      .filter(Boolean)
      .join(", ");
  }
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: hasConflicts ? "OVERRIDE_CONFIRMATION" : "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "reservation_plate_assignment",
    entityId: reservation.id,
    details: {
      assignedPlate: plate,
      conflicts: {
        reservations: overlappingReservations.map((item) => item.reservationNumber),
        blocks: overlappingBlocks.map((item) => item.id),
      },
      overrideReason,
      billedCarGroup: reservation.billedCarGroup,
      assignedVehicleGroup,
      groupOverrideAccepted,
      groupOverrideReason,
      applyPriceAdjustment,
      priceAdjustmentAmount,
      before,
      after: reservationAuditSnapshot(reservation),
    },
  });
}

export async function reassignReservationFromPlanning(
  input: {
    reservationId: string;
    targetPlate: string;
    sourceStatus: "PETICION" | "RESERVA_CONFIRMADA" | "RESERVA_HUERFANA" | "CONTRATADO" | "BLOQUEADO" | "NO_DISPONIBLE" | "";
    sourceGroup: string;
    targetGroup: string;
  },
  actor: { id: string; role: RoleName },
) {
  const reservationId = input.reservationId.trim();
  const targetPlate = input.targetPlate.trim().toUpperCase();
  if (!reservationId || !targetPlate) {
    throw new Error("Faltan datos para reasignar");
  }
  if (!["PETICION", "RESERVA_CONFIRMADA", "RESERVA_HUERFANA"].includes(input.sourceStatus)) {
    throw new Error("Solo se pueden mover peticiones, reservas y huérfanas");
  }

  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  if (reservation.contractId) {
    throw new Error("No se puede mover una reserva con contrato");
  }
  if (reservation.assignedPlate.trim().toUpperCase() === targetPlate) {
    return { changed: false, crossGroup: false };
  }

  const payload: Record<string, string> = {
    assignedPlate: targetPlate,
  };
  const sourceGroup = input.sourceGroup.trim().toUpperCase();
  const targetGroup = input.targetGroup.trim().toUpperCase();
  const crossGroup = Boolean(sourceGroup && targetGroup && sourceGroup !== targetGroup);
  if (crossGroup) {
    payload.groupOverrideAccepted = "true";
    payload.groupOverrideReason = "Reasignación desde planning (drag&drop)";
  }

  await assignPlateToReservation(reservationId, payload, actor);

  return {
    changed: true,
    crossGroup,
    sourceGroup,
    targetGroup,
  };
}

export async function createVehicleBlock(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const plate = (input.vehiclePlate ?? "").trim().toUpperCase();
  const startAt = (input.startAt ?? "").trim();
  const endAt = (input.endAt ?? "").trim();
  const reason = (input.reason ?? "").trim();

  if (!plate || !startAt || !endAt) {
    throw new Error("Faltan campos obligatorios del bloqueo");
  }

  // Reutiliza misma regla de solapes y override que en asignación de matrícula.
  const overlapsReservations = data.reservations.filter(
    (reservation) =>
      reservation.assignedPlate.toUpperCase() === plate &&
      hasOverlap(startAt, endAt, reservation.deliveryAt, reservation.pickupAt),
  );

  const overlapsBlocks = data.vehicleBlocks.filter(
    (block) => block.vehiclePlate.toUpperCase() === plate && hasOverlap(startAt, endAt, block.startAt, block.endAt),
  );

  const hasConflicts = overlapsReservations.length > 0 || overlapsBlocks.length > 0;
  const overrideAccepted = input.overrideAccepted === "true";
  const overrideReason = (input.overrideReason ?? "").trim();

  if (hasConflicts && !overrideAccepted) {
    throw new Error("Bloqueo en conflicto. Debes confirmar override.");
  }
  if (hasConflicts && overrideAccepted && !overrideReason) {
    throw new Error("Debes indicar motivo de override en bloqueo");
  }

  const block: VehicleBlock = {
    id: crypto.randomUUID(),
    vehiclePlate: plate,
    startAt,
    endAt,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };

  data.vehicleBlocks.push(block);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: hasConflicts ? "OVERRIDE_CONFIRMATION" : "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_block",
    entityId: block.id,
    details: {
      vehiclePlate: plate,
      startAt,
      endAt,
      overrideReason,
      conflicts: {
        reservations: overlapsReservations.map((item) => item.reservationNumber),
        blocks: overlapsBlocks.map((item) => item.id),
      },
    },
  });
}

// -------------------- Contratos y cierre con factura --------------------
export async function convertReservationToContract(
  reservationId: string,
  actor: { id: string; role: RoleName },
  input: Record<string, string> = {},
) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);

  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }

  if (reservation.contractId) {
    throw new Error("La reserva ya tiene contrato asociado");
  }

  if (!reservation.assignedPlate && reservation.billedCarGroup && reservation.deliveryAt && reservation.pickupAt) {
    const autoPlate = findFirstAvailablePlateForGroup(data, {
      requestedGroup: reservation.billedCarGroup,
      startAt: reservation.deliveryAt,
      endAt: reservation.pickupAt,
      excludeReservationId: reservation.id,
    });
    if (autoPlate) {
      reservation.assignedPlate = autoPlate;
      const autoVehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === autoPlate) ?? null;
      const autoCategory = autoVehicle ? data.vehicleCategories.find((item) => item.id === autoVehicle.categoryId) ?? null : null;
      reservation.assignedVehicleGroup = autoCategory?.code || autoCategory?.name || reservation.assignedVehicleGroup;
    }
  }

  const plate = reservation.assignedPlate.trim().toUpperCase();
  const overlappingReservations = plate
    ? data.reservations.filter((item) => {
        if (item.id === reservation.id || !item.assignedPlate) {
          return false;
        }
        return item.assignedPlate.toUpperCase() === plate && hasOverlap(item.deliveryAt, item.pickupAt, reservation.deliveryAt, reservation.pickupAt);
      })
    : [];
  const overlappingContracts = plate
    ? data.contracts.filter((item) => {
        if (!item.vehiclePlate) {
          return false;
        }
        return item.vehiclePlate.toUpperCase() === plate && hasOverlap(item.deliveryAt, item.pickupAt, reservation.deliveryAt, reservation.pickupAt);
      })
    : [];
  const overlappingBlocks = plate
    ? data.vehicleBlocks.filter(
        (block) =>
          block.vehiclePlate.toUpperCase() === plate &&
          hasOverlap(block.startAt, block.endAt, reservation.deliveryAt, reservation.pickupAt),
      )
    : [];
  const hasConflicts = overlappingReservations.length > 0 || overlappingContracts.length > 0 || overlappingBlocks.length > 0;
  const overrideAccepted = input.overrideAccepted === "true";
  const overrideReason = (input.overrideReason ?? "").trim();
  if (hasConflicts && !overrideAccepted) {
    throw new Error("Conflicto de solape al contratar. Debes confirmar override.");
  }
  if (hasConflicts && overrideAccepted && !overrideReason) {
    throw new Error("Debes indicar motivo de override al contratar");
  }

  // Numeración secuencial por año+sucursal para trazabilidad contable.
  const branchConfig = resolveBranchFromInput(reservation.branchDelivery, data.companySettings.branches);
  const branch = branchConfig?.code ?? resolveBranchCodeFromInput(reservation.branchDelivery, data.companySettings.branches);
  const branchId = branchConfig?.id ?? 0;
  const branchCounterStart = Math.max(0, branchConfig?.contractCounterStart ?? 0);
  const year = getYear(reservation.deliveryAt);
  const yearShort = getYearShort(reservation.deliveryAt);
  const key = `${year}-${branchId}`;
  const currentCounter = data.counters.contractByYearBranch[key] ?? branchCounterStart;
  const nextCounter = Math.max(currentCounter, branchCounterStart) + 1;
  data.counters.contractByYearBranch[key] = nextCounter;

  const contract: Contract = {
    id: crypto.randomUUID(),
    contractNumber: buildContractNumber(yearShort, branchId, nextCounter),
    reservationId: reservation.id,
    branchCode: branch,
    customerName: reservation.customerName,
    companyName: reservation.customerCompany,
    deliveryAt: reservation.deliveryAt,
    pickupAt: reservation.pickupAt,
    vehiclePlate: reservation.assignedPlate,
    billedCarGroup: reservation.billedCarGroup,
    appliedRate: reservation.appliedRate,
    status: "ABIERTO",
    priceBreakdown: reservation.priceBreakdown,
    extrasBreakdown: reservation.extrasBreakdown,
    discountBreakdown: reservation.discountBreakdown,
    baseAmount: reservation.baseAmount,
    discountAmount: reservation.discountAmount,
    extrasAmount: reservation.extrasAmount,
    fuelAmount: reservation.fuelAmount,
    insuranceAmount: reservation.insuranceAmount,
    penaltiesAmount: reservation.penaltiesAmount,
    ivaPercent: reservation.ivaPercent,
    paymentsMade: reservation.paymentsMade,
    totalSettlement: reservation.totalPrice,
    deductible: reservation.deductible,
    additionalDrivers: reservation.additionalDrivers,
    privateNotes: reservation.privateNotes,
    cashRecord: null,
    internalExpenseIds: [],
    checkOutAt: null,
    checkOutBy: "",
    checkOutKm: 0,
    checkOutFuelLevel: "",
    checkOutNotes: "",
    checkOutPhotos: "",
    checkOutSignatureName: "",
    checkOutSignatureHash: "",
    checkOutSignatureDevice: "",
    checkInAt: null,
    checkInBy: "",
    checkInKm: 0,
    checkInFuelLevel: "",
    checkInNotes: "",
    checkInPhotos: "",
    checkInSignatureName: "",
    checkInSignatureHash: "",
    checkInSignatureDevice: "",
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    closedAt: null,
    invoiceId: null,
  };

  reservation.contractId = contract.id;
  data.contracts.push(contract);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: hasConflicts ? "OVERRIDE_CONFIRMATION" : "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract",
    entityId: contract.id,
    details: {
      sourceReservationId: reservation.id,
      contractNumber: contract.contractNumber,
      snapshot: {
        baseAmount: contract.baseAmount,
        discountAmount: contract.discountAmount,
        extrasAmount: contract.extrasAmount,
        fuelAmount: contract.fuelAmount,
        insuranceAmount: contract.insuranceAmount,
        penaltiesAmount: contract.penaltiesAmount,
        totalSettlement: contract.totalSettlement,
        ivaPercent: contract.ivaPercent,
      },
      autoAssignedPlate: contract.vehiclePlate || "",
      warningWithoutPlate: contract.vehiclePlate ? false : true,
      conflicts: {
        reservations: overlappingReservations.map((item) => item.reservationNumber),
        contracts: overlappingContracts.map((item) => item.contractNumber),
        blocks: overlappingBlocks.map((item) => item.id),
      },
      overrideReason,
    },
  });
}

export async function getContractByNumber(contractNumber: string): Promise<Contract | null> {
  const data = await readRentalData();
  const normalized = contractNumber.trim().toUpperCase();
  if (!normalized) return null;
  return data.contracts.find((item) => item.contractNumber.trim().toUpperCase() === normalized) ?? null;
}

export async function createContractFromScratch(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  await createReservation(
    {
      ...input,
      reservationStatus: "PETICION",
      assignedPlate: (input.assignedPlate ?? "").trim().toUpperCase(),
      customerName: input.customerName ?? "",
      branchDelivery: input.branchDelivery ?? "",
      pickupBranch: input.pickupBranch ?? input.branchDelivery ?? "",
      deliveryAt: input.deliveryAt ?? "",
      pickupAt: input.pickupAt ?? "",
      billedCarGroup: input.billedCarGroup ?? "",
      totalPrice: input.totalPrice ?? "0",
      salesChannel: input.salesChannel ?? "",
    },
    actor,
  );

  const dataAfterReservation = await readRentalData();
  const reservation = dataAfterReservation.reservations
    .filter((item) => item.createdBy === actor.id && !item.contractId)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!reservation) {
    throw new Error("No se pudo localizar la reserva base del contrato");
  }

  await convertReservationToContract(reservation.id, actor, {
    overrideAccepted: input.overrideAccepted ?? "false",
    overrideReason: input.overrideReason ?? "",
  });

  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.reservationId === reservation.id) ?? null;
  if (!contract) {
    throw new Error("No se pudo generar contrato desde creación manual");
  }
  return contract;
}

export async function renumberContract(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO") {
    throw new Error("No se puede renumerar un contrato cerrado");
  }
  const before = contractAuditSnapshot(contract);

  const nextBranchConfig = resolveBranchFromInput(input.branchCode ?? "", data.companySettings.branches);
  const nextBranch = nextBranchConfig?.code ?? resolveBranchCodeFromInput(input.branchCode ?? "", data.companySettings.branches);
  if (!nextBranch || nextBranch === "SUC-ND") {
    throw new Error("Sucursal destino obligatoria");
  }
  const year = getYear(contract.deliveryAt);
  const yearShort = getYearShort(contract.deliveryAt);
  const key = `${year}-${nextBranchConfig?.id ?? 0}`;
  const branchCounterStart = Math.max(0, nextBranchConfig?.contractCounterStart ?? 0);
  let counter = Math.max(data.counters.contractByYearBranch[key] ?? branchCounterStart, branchCounterStart) + 1;
  let candidate = buildContractNumber(yearShort, nextBranchConfig?.id ?? 0, counter);
  while (data.contracts.some((item) => item.id !== contract.id && item.contractNumber === candidate)) {
    counter += 1;
    candidate = buildContractNumber(yearShort, nextBranchConfig?.id ?? 0, counter);
  }
  data.counters.contractByYearBranch[key] = counter;

  const previousContractNumber = contract.contractNumber;
  const previousBranchCode = contract.branchCode;
  contract.contractNumber = candidate;
  contract.branchCode = nextBranch;

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_renumber",
    entityId: contract.id,
    details: {
      previousContractNumber,
      nextContractNumber: candidate,
      previousBranchCode,
      nextBranchCode: nextBranch,
      reason: (input.reason ?? "").trim(),
      before,
      after: contractAuditSnapshot(contract),
    },
  });

  return contract;
}

function resolveReservationConfirmationTemplateHtml(
  templates: Array<{ templateType: string; language: string; htmlContent: string; active: boolean }>,
  language: string,
): string {
  const lang = language.toLowerCase();
  return (
    templates.find((item) => item.templateType === "CONFIRMACION_RESERVA" && item.language === lang && item.active)?.htmlContent ??
    templates.find((item) => item.templateType === "CONFIRMACION_RESERVA" && item.language === "es" && item.active)?.htmlContent ??
    ""
  );
}

function ensureReservationBaseTemplates(data: RentalData) {
  const nowIso = new Date().toISOString();
  let changed = false;
  const definitions = [
    { code: "CONF_RES_ES_BASE", language: "es", title: "Confirmación reserva base ES", templateType: "CONFIRMACION_RESERVA" },
    { code: "CONF_RES_EN_BASE", language: "en", title: "Reservation confirmation base EN", templateType: "CONFIRMACION_RESERVA" },
    { code: "PRES_BASE_ES", language: "es", title: "Presupuesto base ES", templateType: "PRESUPUESTO" },
    { code: "PRES_BASE_EN", language: "en", title: "Quotation base EN", templateType: "PRESUPUESTO" },
    { code: "FAC_BASE_ES", language: "es", title: "Factura base ES", templateType: "FACTURA" },
    { code: "FAC_BASE_EN", language: "en", title: "Invoice base EN", templateType: "FACTURA" },
  ] as const;

  for (const item of definitions) {
    const exists = data.templates.find(
      (template) => template.templateType === item.templateType && template.language === item.language,
    );
    if (exists) continue;
    data.templates.push({
      id: crypto.randomUUID(),
      templateCode: item.code,
      templateType: item.templateType,
      language: item.language,
      title: item.title,
      htmlContent: getTemplatePresetHtml(item.templateType as "CONTRATO" | "CONFIRMACION_RESERVA" | "PRESUPUESTO" | "FACTURA", item.language),
      active: item.language === "es" && item.templateType === "CONFIRMACION_RESERVA",
      createdAt: nowIso,
      createdBy: "system",
      updatedAt: nowIso,
      updatedBy: "system",
    });
    changed = true;
  }
  return changed;
}

function buildReservationConfirmationHtml(
  reservation: Reservation,
  input?: {
    companyName?: string;
    templateHtml?: string;
    taxId?: string;
    fiscalAddress?: string;
    logoDataUrl?: string;
    companyEmailFrom?: string;
    companyPhone?: string;
    companyWebsite?: string;
    companyFooter?: string;
    brandPrimaryColor?: string;
    brandSecondaryColor?: string;
    customer?: Client | null;
    language?: string;
  },
): string {
  const language = (input?.language || input?.customer?.language || "es").toLowerCase();
  const fallback = `
    <html>
      <body style="font-family:Segoe UI, Arial, sans-serif; color:#111827;">
        <h2>Confirmacion de reserva ${reservation.reservationNumber}</h2>
        <p><strong>Empresa:</strong> ${input?.companyName || "N/D"}</p>
        <p><strong>Cliente:</strong> ${reservation.customerName || "N/D"}</p>
        <p><strong>Entrega:</strong> ${reservation.deliveryAt || "N/D"} - ${reservation.deliveryPlace || "N/D"}</p>
        <p><strong>Recogida:</strong> ${reservation.pickupAt || "N/D"} - ${reservation.pickupPlace || "N/D"}</p>
        <p><strong>Grupo reservado:</strong> ${reservation.billedCarGroup || "N/D"}</p>
        <p><strong>Total previsto:</strong> ${reservation.totalPrice.toFixed(2)}</p>
      </body>
    </html>
  `;
  const template = input?.templateHtml || getReservationBaseTemplate(language) || fallback;
  return renderTemplateWithMacros(
    template,
    buildReservationTemplateData({
      language,
      reservation,
      customer: input?.customer ?? null,
      company: {
        name: input?.companyName || "N/D",
        taxId: input?.taxId || "N/D",
        fiscalAddress: input?.fiscalAddress || "N/D",
        emailFrom: input?.companyEmailFrom || "",
        phone: input?.companyPhone || "",
        website: input?.companyWebsite || "",
        footer: input?.companyFooter || "",
        logoDataUrl: input?.logoDataUrl || "",
        brandPrimaryColor: input?.brandPrimaryColor || "#2563eb",
        brandSecondaryColor: input?.brandSecondaryColor || "#0f172a",
      },
    }),
  );
}

export async function sendReservationConfirmation(
  reservationId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }
  const customer = reservation.customerId ? data.clients.find((item) => item.id === reservation.customerId) : null;
  const toEmail = (input.toEmail ?? "").trim() || customer?.email?.trim() || "";
  if (!toEmail) {
    throw new Error("No hay email en cliente para enviar confirmacion");
  }

  const settings = data.companySettings;
  const mailFrom = settings.companyEmailFrom !== "N/D" ? settings.companyEmailFrom : undefined;
  const templateHtml = resolveReservationConfirmationTemplateHtml(data.templates, customer?.language || "es");

  try {
    await sendMailFromCompany({
      fromOverride: mailFrom,
      to: toEmail,
      subject: `Confirmacion reserva ${reservation.reservationNumber}`,
      html: buildReservationConfirmationHtml(reservation, {
        companyName: getDocumentCompanyName(data.companySettings),
        taxId: data.companySettings.taxId,
        fiscalAddress: data.companySettings.fiscalAddress,
        logoDataUrl: data.companySettings.logoDataUrl,
        companyEmailFrom: data.companySettings.companyEmailFrom,
        companyPhone: data.companySettings.companyPhone,
        companyWebsite: data.companySettings.companyWebsite,
        companyFooter: data.companySettings.documentFooter,
        brandPrimaryColor: data.companySettings.brandPrimaryColor,
        brandSecondaryColor: data.companySettings.brandSecondaryColor,
        customer: customer ?? null,
        language: customer?.language || "es",
        templateHtml,
      }),
    });
    reservation.confirmationSentLog.push({
      sentAt: new Date().toISOString(),
      sentBy: actor.id,
      to: toEmail,
      status: "ENVIADA",
    });
  } catch {
    reservation.confirmationSentLog.push({
      sentAt: new Date().toISOString(),
      sentBy: actor.id,
      to: toEmail,
      status: "ERROR",
    });
    await writeRentalData(data);
    throw new Error("Fallo al enviar confirmacion");
  }

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "reservation_confirmation",
    entityId: reservation.id,
    details: { reservationNumber: reservation.reservationNumber, toEmail },
  });
}

export async function listReservationConfirmationLogs(input: { from: string; to: string }) {
  const data = await readRentalData();
  return data.reservations.flatMap((reservation) =>
    reservation.confirmationSentLog
      .filter((log) => isInsideRange(log.sentAt, `${input.from}T00:00:00`, `${input.to}T23:59:59`))
      .map((log) => ({
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        customerName: reservation.customerName,
        sentAt: log.sentAt,
        sentBy: log.sentBy,
        to: log.to,
        status: log.status,
      })),
  );
}

export async function registerContractCash(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);

  if (!contract) {
    throw new Error("Contrato no encontrado");
  }

  if (contract.status === "CERRADO") {
    throw new Error("Contrato ya cerrado");
  }

  const methodRaw = (input.method ?? "").toUpperCase();
  const method = (["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"] as const).includes(
    methodRaw as "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO",
  )
    ? (methodRaw as "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO")
    : "OTRO";
  const amount = parseNumber(input.amount ?? "0");
  const cardLast4 = (input.cardLast4 ?? "").trim();
  if (amount <= 0) {
    throw new Error("Importe de caja debe ser mayor que 0");
  }
  if (method === "TARJETA" && !/^\d{4}$/.test(cardLast4)) {
    throw new Error("En pago con tarjeta debes indicar últimos 4 dígitos");
  }

  contract.cashRecord = {
    amount,
    method,
    cardLast4,
    notes: (input.notes ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };
  contract.paymentsMade = amount;

  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_cash",
    entityId: contract.id,
    details: { contractNumber: contract.contractNumber, amount: contract.cashRecord.amount, method },
  });
}

export async function registerContractCheckOut(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO") {
    throw new Error("No se puede hacer checkout sobre contrato cerrado");
  }
  contract.checkOutAt = new Date().toISOString();
  contract.checkOutBy = actor.id;
  contract.checkOutKm = parseNumber(input.km ?? "0");
  contract.checkOutFuelLevel = (input.fuelLevel ?? "").trim();
  contract.checkOutNotes = (input.notes ?? "").trim();
  contract.checkOutPhotos = (input.photos ?? "").trim();
  const checkOutSigner = (input.signerName ?? "").trim();
  if (!checkOutSigner) {
    throw new Error("Nombre firmante obligatorio en checkout");
  }
  contract.checkOutSignatureName = checkOutSigner;
  contract.checkOutSignatureDevice = (input.signatureDevice ?? "").trim() || "WEB";
  contract.checkOutSignatureHash = createSignatureEvidenceHash({
    contractId: contract.id,
    phase: "CHECKOUT",
    signerName: checkOutSigner,
    signerId: actor.id,
    notes: contract.checkOutNotes,
    km: contract.checkOutKm,
    fuelLevel: contract.checkOutFuelLevel,
    signedAtIso: contract.checkOutAt || new Date().toISOString(),
  });
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_checkout",
    entityId: contract.id,
    details: {
      contractNumber: contract.contractNumber,
      km: contract.checkOutKm,
      fuelLevel: contract.checkOutFuelLevel,
      signatureHash: contract.checkOutSignatureHash,
    },
  });
}

export async function registerContractCheckIn(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO") {
    throw new Error("Contrato ya cerrado");
  }
  contract.checkInAt = new Date().toISOString();
  contract.checkInBy = actor.id;
  contract.checkInKm = parseNumber(input.km ?? "0");
  contract.checkInFuelLevel = (input.fuelLevel ?? "").trim();
  contract.checkInNotes = (input.notes ?? "").trim();
  contract.checkInPhotos = (input.photos ?? "").trim();
  const checkInSigner = (input.signerName ?? "").trim();
  if (!checkInSigner) {
    throw new Error("Nombre firmante obligatorio en checkin");
  }
  contract.checkInSignatureName = checkInSigner;
  contract.checkInSignatureDevice = (input.signatureDevice ?? "").trim() || "WEB";
  contract.checkInSignatureHash = createSignatureEvidenceHash({
    contractId: contract.id,
    phase: "CHECKIN",
    signerName: checkInSigner,
    signerId: actor.id,
    notes: contract.checkInNotes,
    km: contract.checkInKm,
    fuelLevel: contract.checkInFuelLevel,
    signedAtIso: contract.checkInAt || new Date().toISOString(),
  });
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_checkin",
    entityId: contract.id,
    details: {
      contractNumber: contract.contractNumber,
      km: contract.checkInKm,
      fuelLevel: contract.checkInFuelLevel,
      signatureHash: contract.checkInSignatureHash,
    },
  });
}

export async function changeContractVehicle(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO") {
    throw new Error("No se puede cambiar vehículo en contrato cerrado");
  }
  const before = contractAuditSnapshot(contract);

  const nextPlate = (input.vehiclePlate ?? "").trim().toUpperCase();
  if (!nextPlate) {
    throw new Error("Matrícula obligatoria");
  }

  const fleetVehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === nextPlate);
  if (!fleetVehicle) {
    throw new Error("La matrícula no existe en flota activa");
  }

  const conflictsByContract = data.contracts.filter((item) => {
    if (item.id === contract.id || !item.vehiclePlate) {
      return false;
    }
    return (
      item.vehiclePlate.toUpperCase() === nextPlate &&
      item.status === "ABIERTO" &&
      hasOverlap(item.deliveryAt, item.pickupAt, contract.deliveryAt, contract.pickupAt)
    );
  });

  const conflictsByReservation = data.reservations.filter((item) => {
    if (!item.assignedPlate || item.id === contract.reservationId) {
      return false;
    }
    return item.assignedPlate.toUpperCase() === nextPlate && hasOverlap(item.deliveryAt, item.pickupAt, contract.deliveryAt, contract.pickupAt);
  });

  const conflictsByBlock = data.vehicleBlocks.filter(
    (block) =>
      block.vehiclePlate.toUpperCase() === nextPlate &&
      hasOverlap(block.startAt, block.endAt, contract.deliveryAt, contract.pickupAt),
  );

  const hasConflicts = conflictsByContract.length > 0 || conflictsByReservation.length > 0 || conflictsByBlock.length > 0;
  const overrideAccepted = input.overrideAccepted === "true";
  const overrideReason = (input.overrideReason ?? "").trim();
  if (hasConflicts && !overrideAccepted) {
    throw new Error("Vehículo no disponible en esas fechas. Debes confirmar override.");
  }
  if (hasConflicts && overrideAccepted && !overrideReason) {
    throw new Error("Debes indicar motivo de override para cambiar vehículo");
  }

  const previousPlate = contract.vehiclePlate;
  contract.vehiclePlate = nextPlate;
  const sourceReservation = data.reservations.find((item) => item.id === contract.reservationId);
  if (sourceReservation) {
    sourceReservation.assignedPlate = nextPlate;
  }

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: hasConflicts ? "OVERRIDE_CONFIRMATION" : "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_vehicle_change",
    entityId: contract.id,
    details: {
      contractNumber: contract.contractNumber,
      previousPlate,
      nextPlate,
      changeAt: (input.changeAt ?? "").trim(),
      reason: (input.changeReason ?? "").trim(),
      kmOut: parseNumber(input.kmOut ?? "0"),
      kmIn: parseNumber(input.kmIn ?? "0"),
      fuelOut: (input.fuelOut ?? "").trim(),
      fuelIn: (input.fuelIn ?? "").trim(),
      notes: (input.notes ?? "").trim(),
      overrideReason,
      conflicts: {
        contracts: conflictsByContract.map((item) => item.contractNumber),
        reservations: conflictsByReservation.map((item) => item.reservationNumber),
        blocks: conflictsByBlock.map((item) => item.id),
      },
      before,
      after: contractAuditSnapshot(contract),
    },
  });
}

export async function addInternalExpense(
  contractId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);

  if (!contract) {
    throw new Error("Contrato no encontrado");
  }

  const categoryRaw = (input.category ?? "").toUpperCase();
  const category = (["PEAJE", "GASOLINA", "COMIDA", "PARKING", "LAVADO", "OTRO"] as const).includes(
    categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO",
  )
    ? (categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO")
    : "OTRO";

  const expense: InternalExpense = {
    id: crypto.randomUUID(),
    contractId,
    vehiclePlate: input.vehiclePlate?.trim() || contract.vehiclePlate,
    expenseDate: input.expenseDate?.trim() || new Date().toISOString().slice(0, 10),
    category,
    amount: parseNumber(input.amount ?? "0"),
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };

  data.internalExpenses.push(expense);
  contract.internalExpenseIds.push(expense.id);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "internal_expense",
    entityId: expense.id,
    details: { contractId, category: expense.category, amount: expense.amount },
  });
}

export async function createDailyOperationalExpense(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const categoryRaw = (input.category ?? "").toUpperCase();
  const category = (["PEAJE", "GASOLINA", "COMIDA", "PARKING", "LAVADO", "OTRO"] as const).includes(
    categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO",
  )
    ? (categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO")
    : "OTRO";
  const expenseDate = (input.expenseDate ?? "").trim();
  const workerName = (input.workerName ?? "").trim();
  const note = (input.note ?? "").trim();
  const totalAmount = parseNumber(input.amount ?? "0");
  const rawPlates = (input.vehiclePlates ?? "")
    .split(/[\n,; ]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const plates = Array.from(new Set(rawPlates));

  if (!expenseDate || !parseDateSafe(`${expenseDate}T00:00:00`)) {
    throw new Error("Fecha de gasto no válida");
  }
  if (!workerName) {
    throw new Error("Empleado obligatorio");
  }
  if (totalAmount <= 0) {
    throw new Error("Importe total debe ser mayor que 0");
  }
  if (plates.length === 0) {
    throw new Error("Debes indicar al menos una matrícula");
  }

  const fleetSet = new Set(data.fleetVehicles.map((vehicle) => vehicle.plate.toUpperCase()));
  const invalidPlates = plates.filter((plate) => !fleetSet.has(plate));
  if (invalidPlates.length > 0) {
    throw new Error(`Matrículas no válidas en flota: ${invalidPlates.join(", ")}`);
  }

  const dayStart = `${expenseDate}T00:00:00`;
  const dayEnd = `${expenseDate}T23:59:59`;
  const rentedPlates = new Set(
    data.contracts
      .filter((contract) => hasOverlap(contract.deliveryAt, contract.pickupAt, dayStart, dayEnd))
      .map((contract) => contract.vehiclePlate.trim().toUpperCase())
      .filter(Boolean),
  );
  const notRentedPlates = plates.filter((plate) => !rentedPlates.has(plate));
  if (notRentedPlates.length > 0) {
    throw new Error(`Solo se permiten matrículas con alquiler activo ese día: ${notRentedPlates.join(", ")}`);
  }

  const splitAmounts = splitAmountEqually(totalAmount, plates.length);
  const batchId = crypto.randomUUID();
  const expenses: InternalExpense[] = plates.map((plate, index) => ({
    id: crypto.randomUUID(),
    contractId: "__DIARIO__",
    vehiclePlate: plate,
    expenseDate,
    category,
    amount: splitAmounts[index] ?? 0,
    note: `[BATCH:${batchId}] empleado=${workerName}; reparto=${index + 1}/${plates.length}; ${note}`.trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  }));

  data.internalExpenses.push(...expenses);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "daily_operational_expense",
    entityId: batchId,
    details: {
      expenseDate,
      workerName,
      category,
      totalAmount,
      plates,
      splitAmounts,
    },
  });
}

export async function updateInternalExpense(
  expenseId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const expense = data.internalExpenses.find((item) => item.id === expenseId);
  if (!expense) {
    throw new Error("Gasto no encontrado");
  }
  const categoryRaw = (input.category ?? expense.category).toUpperCase();
  const category = (["PEAJE", "GASOLINA", "COMIDA", "PARKING", "LAVADO", "OTRO"] as const).includes(
    categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO",
  )
    ? (categoryRaw as "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO")
    : expense.category;

  const vehiclePlate = (input.vehiclePlate ?? expense.vehiclePlate).trim().toUpperCase();
  const expenseDate = (input.expenseDate ?? expense.expenseDate).trim();
  const amount = input.amount ? parseNumber(input.amount) : expense.amount;
  if (amount <= 0) {
    throw new Error("Importe debe ser mayor que 0");
  }
  if (!data.fleetVehicles.some((item) => item.plate.toUpperCase() === vehiclePlate)) {
    throw new Error("Matrícula no válida en flota");
  }

  expense.category = category;
  expense.vehiclePlate = vehiclePlate;
  expense.expenseDate = expenseDate;
  expense.amount = amount;

  if (expense.contractId === "__DIARIO__") {
    const workerName = (input.workerName ?? parseDailyExpenseMeta(expense.note).workerName).trim();
    if (!workerName) {
      throw new Error("Empleado obligatorio");
    }
    const dayStart = `${expenseDate}T00:00:00`;
    const dayEnd = `${expenseDate}T23:59:59`;
    const hasActiveRental = data.contracts.some(
      (contract) =>
        contract.vehiclePlate.toUpperCase() === vehiclePlate.toUpperCase() &&
        hasOverlap(contract.deliveryAt, contract.pickupAt, dayStart, dayEnd),
    );
    if (!hasActiveRental) {
      throw new Error(`Solo se permiten matrículas con alquiler activo ese día: ${vehiclePlate}`);
    }
    const existingBatch = parseDailyExpenseMeta(expense.note).batchId || crypto.randomUUID();
    const note = (input.note ?? expense.note).trim();
    expense.note = `[BATCH:${existingBatch}] empleado=${workerName}; ${note}`.trim();
  } else {
    expense.note = (input.note ?? expense.note).trim();
  }

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "internal_expense_update",
    entityId: expense.id,
    details: { contractId: expense.contractId, amount: expense.amount, category: expense.category },
  });
}

export async function deleteInternalExpense(expenseId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const expense = data.internalExpenses.find((item) => item.id === expenseId);
  if (!expense) {
    throw new Error("Gasto no encontrado");
  }
  data.internalExpenses = data.internalExpenses.filter((item) => item.id !== expenseId);
  if (expense.contractId !== "__DIARIO__") {
    const contract = data.contracts.find((item) => item.id === expense.contractId);
    if (contract) {
      contract.internalExpenseIds = contract.internalExpenseIds.filter((id) => id !== expenseId);
    }
  }
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "internal_expense_delete",
    entityId: expense.id,
    details: { contractId: expense.contractId, amount: expense.amount, category: expense.category },
  });
}

export async function listDailyOperationalExpenses(input: { from: string; to: string; plate: string; worker: string }) {
  const data = await readRentalData();
  const plateFilter = input.plate.trim().toUpperCase();
  const workerFilter = input.worker.trim().toLowerCase();

  const rows = data.internalExpenses
    .filter((expense) => expense.contractId === "__DIARIO__")
    .filter((expense) => isInsideRange(`${expense.expenseDate}T12:00:00`, `${input.from}T00:00:00`, `${input.to}T23:59:59`))
    .filter((expense) => !plateFilter || expense.vehiclePlate.toUpperCase().includes(plateFilter))
    .filter((expense) => {
      if (!workerFilter) return true;
      return parseDailyExpenseMeta(expense.note).workerName.toLowerCase().includes(workerFilter);
    })
    .map((expense) => ({
      ...expense,
      ...parseDailyExpenseMeta(expense.note),
    }))
    .toSorted((a, b) => `${b.expenseDate}-${b.createdAt}`.localeCompare(`${a.expenseDate}-${a.createdAt}`));

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  return { rows, totalAmount };
}

export async function validateDailyOperationalExpenses(input: { from: string; to: string }) {
  const data = await readRentalData();
  const rows = data.internalExpenses.filter(
    (expense) =>
      expense.contractId === "__DIARIO__" &&
      isInsideRange(`${expense.expenseDate}T12:00:00`, `${input.from}T00:00:00`, `${input.to}T23:59:59`),
  );

  const noBatch = rows.filter((row) => !parseDailyExpenseMeta(row.note).batchId).length;
  const noWorker = rows.filter((row) => !parseDailyExpenseMeta(row.note).workerName).length;
  const notInFleet = rows.filter(
    (row) => !data.fleetVehicles.some((vehicle) => vehicle.plate.toUpperCase() === row.vehiclePlate.toUpperCase()),
  ).length;
  const withoutActiveRental = rows.filter((row) => {
    const dayStart = `${row.expenseDate}T00:00:00`;
    const dayEnd = `${row.expenseDate}T23:59:59`;
    return !data.contracts.some(
      (contract) =>
        contract.vehiclePlate.toUpperCase() === row.vehiclePlate.toUpperCase() &&
        hasOverlap(contract.deliveryAt, contract.pickupAt, dayStart, dayEnd),
    );
  }).length;

  return {
    totalRows: rows.length,
    noBatch,
    noWorker,
    notInFleet,
    withoutActiveRental,
    ok: noBatch === 0 && noWorker === 0 && notInFleet === 0 && withoutActiveRental === 0,
  };
}

export type DataIntegrityIssueCode =
  | "RESERVATION_CUSTOMER_NOT_FOUND"
  | "RESERVATION_PLATE_NOT_IN_FLEET"
  | "RESERVATION_CONTRACT_NOT_FOUND"
  | "CONTRACT_RESERVATION_NOT_FOUND"
  | "CONTRACT_INVOICE_NOT_FOUND"
  | "CONTRACT_INTERNAL_EXPENSE_NOT_FOUND"
  | "INVOICE_CONTRACT_NOT_FOUND"
  | "INTERNAL_EXPENSE_CONTRACT_NOT_FOUND"
  | "INTERNAL_EXPENSE_PLATE_NOT_IN_FLEET"
  | "FLEET_MODEL_NOT_FOUND"
  | "FLEET_CATEGORY_NOT_FOUND"
  | "TARIFF_BRACKET_PLAN_NOT_FOUND"
  | "TARIFF_PRICE_PLAN_NOT_FOUND"
  | "TARIFF_PRICE_BRACKET_NOT_FOUND"
  | "DUPLICATE_RESERVATION_NUMBER"
  | "DUPLICATE_CONTRACT_NUMBER"
  | "DUPLICATE_INVOICE_NUMBER"
  | "DUPLICATE_FLEET_PLATE";

export type DataIntegrityIssue = {
  code: DataIntegrityIssueCode;
  entity: string;
  entityId: string;
  reference: string;
  message: string;
};

function pushDuplicateIssues(
  values: Array<{ value: string; entity: string; entityId: string }>,
  code: DataIntegrityIssueCode,
  messagePrefix: string,
  output: DataIntegrityIssue[],
) {
  const byValue = new Map<string, Array<{ entity: string; entityId: string }>>();
  for (const item of values) {
    const normalized = item.value.trim().toUpperCase();
    if (!normalized) continue;
    const current = byValue.get(normalized) ?? [];
    current.push({ entity: item.entity, entityId: item.entityId });
    byValue.set(normalized, current);
  }
  for (const [value, rows] of byValue.entries()) {
    if (rows.length < 2) continue;
    for (const row of rows) {
      output.push({
        code,
        entity: row.entity,
        entityId: row.entityId,
        reference: value,
        message: `${messagePrefix}: ${value}`,
      });
    }
  }
}

export async function validateDataIntegrity() {
  const data = await readRentalData();
  const issues: DataIntegrityIssue[] = [];

  const clientIds = new Set(data.clients.map((item) => item.id));
  const reservationIds = new Set(data.reservations.map((item) => item.id));
  const contractIds = new Set(data.contracts.map((item) => item.id));
  const invoiceIds = new Set(data.invoices.map((item) => item.id));
  const internalExpenseIds = new Set(data.internalExpenses.map((item) => item.id));
  const fleetPlates = new Set(data.fleetVehicles.map((item) => item.plate.trim().toUpperCase()));
  const modelIds = new Set(data.vehicleModels.map((item) => item.id));
  const categoryIds = new Set(data.vehicleCategories.map((item) => item.id));
  const tariffPlanIds = new Set(data.tariffPlans.map((item) => item.id));
  const tariffBracketIds = new Set(data.tariffBrackets.map((item) => item.id));

  for (const reservation of data.reservations) {
    if (reservation.customerId && !clientIds.has(reservation.customerId)) {
      issues.push({
        code: "RESERVATION_CUSTOMER_NOT_FOUND",
        entity: "reservation",
        entityId: reservation.id,
        reference: reservation.customerId,
        message: `Cliente asociado no existe: ${reservation.customerId}`,
      });
    }
    if (reservation.assignedPlate && !fleetPlates.has(reservation.assignedPlate.trim().toUpperCase())) {
      issues.push({
        code: "RESERVATION_PLATE_NOT_IN_FLEET",
        entity: "reservation",
        entityId: reservation.id,
        reference: reservation.assignedPlate,
        message: `Matrícula asignada fuera de flota: ${reservation.assignedPlate}`,
      });
    }
    if (reservation.contractId && !contractIds.has(reservation.contractId)) {
      issues.push({
        code: "RESERVATION_CONTRACT_NOT_FOUND",
        entity: "reservation",
        entityId: reservation.id,
        reference: reservation.contractId,
        message: `Contrato asociado no existe: ${reservation.contractId}`,
      });
    }
  }

  for (const contract of data.contracts) {
    if (!reservationIds.has(contract.reservationId)) {
      issues.push({
        code: "CONTRACT_RESERVATION_NOT_FOUND",
        entity: "contract",
        entityId: contract.id,
        reference: contract.reservationId,
        message: `Reserva asociada no existe: ${contract.reservationId}`,
      });
    }
    if (contract.invoiceId && !invoiceIds.has(contract.invoiceId)) {
      issues.push({
        code: "CONTRACT_INVOICE_NOT_FOUND",
        entity: "contract",
        entityId: contract.id,
        reference: contract.invoiceId,
        message: `Factura asociada no existe: ${contract.invoiceId}`,
      });
    }
    for (const expenseId of contract.internalExpenseIds) {
      if (!internalExpenseIds.has(expenseId)) {
        issues.push({
          code: "CONTRACT_INTERNAL_EXPENSE_NOT_FOUND",
          entity: "contract",
          entityId: contract.id,
          reference: expenseId,
          message: `Gasto interno asociado no existe: ${expenseId}`,
        });
      }
    }
  }

  for (const invoice of data.invoices) {
    if (invoice.contractId && !contractIds.has(invoice.contractId)) {
      issues.push({
        code: "INVOICE_CONTRACT_NOT_FOUND",
        entity: "invoice",
        entityId: invoice.id,
        reference: invoice.contractId,
        message: `Contrato asociado no existe: ${invoice.contractId}`,
      });
    }
  }

  for (const expense of data.internalExpenses) {
    if (expense.contractId !== "__DIARIO__" && !contractIds.has(expense.contractId)) {
      issues.push({
        code: "INTERNAL_EXPENSE_CONTRACT_NOT_FOUND",
        entity: "internal_expense",
        entityId: expense.id,
        reference: expense.contractId,
        message: `Contrato asociado de gasto no existe: ${expense.contractId}`,
      });
    }
    if (expense.vehiclePlate && !fleetPlates.has(expense.vehiclePlate.trim().toUpperCase())) {
      issues.push({
        code: "INTERNAL_EXPENSE_PLATE_NOT_IN_FLEET",
        entity: "internal_expense",
        entityId: expense.id,
        reference: expense.vehiclePlate,
        message: `Matrícula de gasto fuera de flota: ${expense.vehiclePlate}`,
      });
    }
  }

  for (const vehicle of data.fleetVehicles) {
    if (!modelIds.has(vehicle.modelId)) {
      issues.push({
        code: "FLEET_MODEL_NOT_FOUND",
        entity: "fleet_vehicle",
        entityId: vehicle.id,
        reference: vehicle.modelId,
        message: `Modelo no existe para matrícula ${vehicle.plate}: ${vehicle.modelId}`,
      });
    }
    if (!categoryIds.has(vehicle.categoryId)) {
      issues.push({
        code: "FLEET_CATEGORY_NOT_FOUND",
        entity: "fleet_vehicle",
        entityId: vehicle.id,
        reference: vehicle.categoryId,
        message: `Categoría no existe para matrícula ${vehicle.plate}: ${vehicle.categoryId}`,
      });
    }
  }

  for (const bracket of data.tariffBrackets) {
    if (!tariffPlanIds.has(bracket.tariffPlanId)) {
      issues.push({
        code: "TARIFF_BRACKET_PLAN_NOT_FOUND",
        entity: "tariff_bracket",
        entityId: bracket.id,
        reference: bracket.tariffPlanId,
        message: `Tarifa de tramo no existe: ${bracket.tariffPlanId}`,
      });
    }
  }

  for (const price of data.tariffPrices) {
    if (!tariffPlanIds.has(price.tariffPlanId)) {
      issues.push({
        code: "TARIFF_PRICE_PLAN_NOT_FOUND",
        entity: "tariff_price",
        entityId: price.id,
        reference: price.tariffPlanId,
        message: `Tarifa de precio no existe: ${price.tariffPlanId}`,
      });
    }
    if (!tariffBracketIds.has(price.bracketId)) {
      issues.push({
        code: "TARIFF_PRICE_BRACKET_NOT_FOUND",
        entity: "tariff_price",
        entityId: price.id,
        reference: price.bracketId,
        message: `Tramo de precio no existe: ${price.bracketId}`,
      });
    }
  }

  pushDuplicateIssues(
    data.reservations.map((item) => ({ value: item.reservationNumber, entity: "reservation", entityId: item.id })),
    "DUPLICATE_RESERVATION_NUMBER",
    "Número de reserva duplicado",
    issues,
  );
  pushDuplicateIssues(
    data.contracts.map((item) => ({ value: item.contractNumber, entity: "contract", entityId: item.id })),
    "DUPLICATE_CONTRACT_NUMBER",
    "Número de contrato duplicado",
    issues,
  );
  pushDuplicateIssues(
    data.invoices.map((item) => ({ value: item.invoiceNumber, entity: "invoice", entityId: item.id })),
    "DUPLICATE_INVOICE_NUMBER",
    "Número de factura duplicado",
    issues,
  );
  pushDuplicateIssues(
    data.fleetVehicles.map((item) => ({ value: item.plate, entity: "fleet_vehicle", entityId: item.id })),
    "DUPLICATE_FLEET_PLATE",
    "Matrícula duplicada en flota",
    issues,
  );

  const byCode = issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.code] = (acc[issue.code] ?? 0) + 1;
    return acc;
  }, {});

  return {
    checkedAt: new Date().toISOString(),
    ok: issues.length === 0,
    totalIssues: issues.length,
    byCode,
    issues,
  };
}

export async function listActiveRentalPlatesByDate(expenseDate: string) {
  const data = await readRentalData();
  if (!parseDateSafe(`${expenseDate}T00:00:00`)) {
    throw new Error("Fecha no válida");
  }
  const dayStart = `${expenseDate}T00:00:00`;
  const dayEnd = `${expenseDate}T23:59:59`;
  const contractPlates = Array.from(
    new Set(
      data.contracts
        .filter((contract) => hasOverlap(contract.deliveryAt, contract.pickupAt, dayStart, dayEnd))
        .map((contract) => contract.vehiclePlate.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).toSorted((a, b) => a.localeCompare(b));

  const fleetByPlate = new Map(
    data.fleetVehicles.map((vehicle) => [vehicle.plate.toUpperCase(), vehicle]),
  );
  const categoryById = new Map(data.vehicleCategories.map((category) => [category.id, category]));
  const modelById = new Map(data.vehicleModels.map((model) => [model.id, model]));

  return contractPlates.map((plate) => {
    const vehicle = fleetByPlate.get(plate);
    const category = vehicle ? categoryById.get(vehicle.categoryId) : null;
    const model = vehicle ? modelById.get(vehicle.modelId) : null;
    return {
      plate,
      groupLabel: category?.code || category?.name || "N/D",
      modelLabel: model ? `${model.brand} ${model.model}` : "N/D",
    };
  });
}

export async function closeContract(contractId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);

  if (!contract) {
    throw new Error("Contrato no encontrado");
  }

  if (!contract.cashRecord) {
    throw new Error("No se puede cerrar contrato sin caja registrada");
  }

  if (contract.status === "CERRADO") {
    throw new Error("Contrato ya cerrado");
  }
  const before = contractAuditSnapshot(contract);

  // El cierre de contrato genera factura automáticamente y la vincula.
  const ivaPercent = contract.ivaPercent || data.companySettings.defaultIvaPercent;
  const baseAmount = contract.baseAmount;
  const extrasAmount = contract.extrasAmount;
  const insuranceAmount = contract.insuranceAmount;
  const penaltiesAmount = contract.penaltiesAmount;
  const subtotal = baseAmount + extrasAmount + insuranceAmount + penaltiesAmount;
  const ivaAmount = (subtotal * ivaPercent) / 100;

  const counterScope = data.companySettings.invoiceNumberScope === "GLOBAL" ? "GLOBAL" : "BRANCH";
  const invoiceSeries = normalizeInvoiceSeries(data.companySettings.invoiceSeriesByType.F, "F");
  const key = resolveInvoiceCounterKey({
    scope: counterScope,
    branchCode: contract.branchCode,
    invoiceSeries,
  });
  let invoiceCounter = (data.counters.invoiceByYearBranch[key] ?? 0) + 1;
  let invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  while (data.invoices.some((item) => item.invoiceNumber === invoiceNumberCandidate)) {
    invoiceCounter += 1;
    invoiceNumberCandidate = buildInvoiceNumber(invoiceSeries, invoiceCounter);
  }
  data.counters.invoiceByYearBranch[key] = invoiceCounter;

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    invoiceNumber: invoiceNumberCandidate,
    invoiceName: `Factura ${contract.contractNumber}`,
    sourceType: "CONTRATO",
    invoiceType: "F",
    contractId: contract.id,
    sourceInvoiceId: null,
    issuedAt: new Date().toISOString(),
    baseAmount,
    extrasAmount,
    insuranceAmount,
    penaltiesAmount,
    ivaPercent,
    ivaAmount,
    totalAmount: subtotal + ivaAmount,
    manualCustomerName: "",
    manualCustomerTaxId: "",
    manualCustomerAddress: "",
    manualCustomerEmail: "",
    manualLanguage: "",
    status: "FINAL",
    finalizedAt: new Date().toISOString(),
    finalizedBy: actor.id,
    sentLog: [],
  };

  contract.status = "CERRADO";
  contract.closedAt = new Date().toISOString();
  contract.invoiceId = invoice.id;

  data.invoices.push(invoice);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_close",
    entityId: contract.id,
    details: {
      contractNumber: contract.contractNumber,
      invoiceNumber: invoice.invoiceNumber,
      cashAmount: contract.cashRecord.amount,
      totalSettlement: contract.totalSettlement,
      before,
      after: contractAuditSnapshot(contract),
    },
  });
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "invoice",
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, contractId: contract.id },
  });
}

export async function updateContract(contractId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO") {
    throw new Error("No se puede editar contrato cerrado");
  }
  const before = contractAuditSnapshot(contract);
  contract.customerName = (input.customerName ?? contract.customerName).trim();
  contract.companyName = (input.companyName ?? contract.companyName).trim();
  contract.deliveryAt = (input.deliveryAt ?? contract.deliveryAt).trim();
  contract.pickupAt = (input.pickupAt ?? contract.pickupAt).trim();
  contract.billedCarGroup = (input.billedCarGroup ?? contract.billedCarGroup).trim();
  contract.appliedRate = (input.appliedRate ?? contract.appliedRate).trim().toUpperCase();
  contract.vehiclePlate = (input.assignedPlate ?? contract.vehiclePlate).trim().toUpperCase();
  contract.deductible = (input.deductible ?? contract.deductible).trim();
  contract.privateNotes = (input.privateNotes ?? contract.privateNotes).trim();
  contract.baseAmount = input.baseAmount ? parseNumber(input.baseAmount) : contract.baseAmount;
  const courtesyHours = getGlobalCourtesyHours(data.companySettings);
  const billedDays = Math.max(1, computeBilledDaysBy24h(contract.deliveryAt, contract.pickupAt, courtesyHours));
  if (contract.appliedRate !== SPECIAL_RATE_CODE_MANUAL) {
    const plansByCode = contract.appliedRate
      ? data.tariffPlans.filter((item) => item.code.toUpperCase() === contract.appliedRate.toUpperCase())
      : [];
    if (plansByCode.length > 0 && contract.billedCarGroup && billedDays > 0) {
      const computedTariff = calculateTariffAmountFromPlans({
        data,
        plans: plansByCode,
        groupCode: contract.billedCarGroup,
        billedDays,
        deliveryAt: contract.deliveryAt,
        pickupAt: contract.pickupAt,
        courtesyHours,
      });
      if (computedTariff.found) {
        contract.appliedRate = computedTariff.isSeasonSplit ? SPECIAL_RATE_CODE_SEASON_CROSS : contract.appliedRate;
      }
    }
  }
  const computedExtras = calculateExtrasFromSelection(
    {
      selected: parseSelectedExtrasPayload(String(input.selectedExtrasPayload ?? "")),
      billedDays,
      fallbackAmount: input.extrasAmount ? parseNumber(input.extrasAmount) : contract.extrasAmount,
      fallbackBreakdown: (input.extrasBreakdown ?? contract.extrasBreakdown).trim(),
    },
    data.vehicleExtras.filter((item) => item.kind === "EXTRA"),
  );
  const computedDiscount = calculateDiscountsFromSelection({
    selected: parseSelectedDiscountsPayload(String(input.selectedDiscountsPayload ?? "")),
    baseAmount: contract.baseAmount,
    fallbackAmount: input.discountAmount ? parseNumber(input.discountAmount) : contract.discountAmount,
    fallbackBreakdown: (input.discountBreakdown ?? contract.discountBreakdown).trim(),
  });
  contract.discountAmount = computedDiscount.amount;
  contract.discountBreakdown = computedDiscount.breakdown;
  contract.extrasAmount = computedExtras.amount;
  contract.extrasBreakdown = computedExtras.breakdown;
  contract.fuelAmount = input.fuelAmount ? parseNumber(input.fuelAmount) : contract.fuelAmount;
  contract.insuranceAmount = input.insuranceAmount ? parseNumber(input.insuranceAmount) : contract.insuranceAmount;
  contract.penaltiesAmount = input.penaltiesAmount ? parseNumber(input.penaltiesAmount) : contract.penaltiesAmount;
  contract.paymentsMade = input.paymentsMade ? parseNumber(input.paymentsMade) : contract.paymentsMade;
  const totalCalculated = calculateReservationTotal({
    baseAmount: contract.baseAmount,
    discountAmount: contract.discountAmount,
    extrasAmount: contract.extrasAmount,
    fuelAmount: contract.fuelAmount,
    insuranceAmount: contract.insuranceAmount,
    penaltiesAmount: contract.penaltiesAmount,
  });
  contract.totalSettlement = input.totalPrice ? parseNumber(input.totalPrice) : totalCalculated;
  contract.priceBreakdown = [
    `base:${formatMoney(contract.baseAmount)}`,
    `descuento:${formatMoney(contract.discountAmount)}`,
    `extras:${formatMoney(contract.extrasAmount)}`,
    `combustible:${formatMoney(contract.fuelAmount)}`,
    `cdw:${formatMoney(contract.insuranceAmount)}`,
    `extension:${formatMoney(contract.penaltiesAmount)}`,
    `total:${formatMoney(contract.totalSettlement)}`,
  ].join(", ");
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_update",
    entityId: contract.id,
    details: {
      contractNumber: contract.contractNumber,
      before,
      after: contractAuditSnapshot(contract),
    },
  });
}

export async function deleteContract(contractId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }
  if (contract.status === "CERRADO" || contract.invoiceId) {
    throw new Error("No se puede borrar contrato cerrado o facturado");
  }
  if (data.internalExpenses.some((item) => item.contractId === contractId)) {
    throw new Error("No se puede borrar contrato con gastos asociados");
  }
  const reservation = data.reservations.find((item) => item.id === contract.reservationId);
  if (reservation) {
    reservation.contractId = null;
  }
  data.contracts = data.contracts.filter((item) => item.id !== contractId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "contract_delete",
    entityId: contract.id,
    details: { contractNumber: contract.contractNumber },
  });
}

export async function getContractDetails(contractId: string) {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    return null;
  }

  const expenses = data.internalExpenses.filter((item) => item.contractId === contract.id);
  const invoice = contract.invoiceId ? data.invoices.find((item) => item.id === contract.invoiceId) ?? null : null;

  return { contract, expenses, invoice };
}

// -------------------- Listados operativos (entregas/recogidas) --------------------
export type DeliveryPickupListRow = {
  reservationId: string;
  reservationNumber: string;
  hasContract: boolean;
  contractNumber: string;
  stateLabel: "PETICION" | "CONFIRMADA" | "CONTRATADA";
  customerName: string;
  place: string;
  branch: string;
  datetime: string;
  datetimeRaw: string;
  vehiclePlate: string;
  totalPrice: number;
  days: number;
  privateNotes: string;
};

export async function listDeliveries(input: { from: string; to: string; branch: string }) {
  const data = await readRentalData();
  const branchFilter = input.branch.trim().toLowerCase();
  const rows: DeliveryPickupListRow[] = data.reservations
    .filter((reservation) => {
      const inDate = isInsideRange(reservation.deliveryAt, input.from, input.to);
      if (!inDate) {
        return false;
      }
      if (!branchFilter) {
        return true;
      }
      return reservation.branchDelivery.toLowerCase().includes(branchFilter);
    })
    .map((reservation) => {
      const contract = reservation.contractId
        ? data.contracts.find((item) => item.id === reservation.contractId) ?? null
        : null;
      return mapListRow(reservation, contract, "DELIVERY");
    })
    .toSorted((a, b) => a.datetime.localeCompare(b.datetime));

  return {
    withContract: rows.filter((row) => row.hasContract),
    withoutContract: rows.filter((row) => !row.hasContract || !row.vehiclePlate),
  };
}

export async function listPickups(input: { from: string; to: string; branch: string }) {
  const data = await readRentalData();
  const branchFilter = input.branch.trim().toLowerCase();
  const rows: DeliveryPickupListRow[] = data.reservations
    .filter((reservation) => {
      const inDate = isInsideRange(reservation.pickupAt, input.from, input.to);
      if (!inDate) {
        return false;
      }
      if (!branchFilter) {
        return true;
      }
      return reservation.pickupBranch.toLowerCase().includes(branchFilter);
    })
    .map((reservation) => {
      const contract = reservation.contractId
        ? data.contracts.find((item) => item.id === reservation.contractId) ?? null
        : null;
      return mapListRow(reservation, contract, "PICKUP");
    })
    .toSorted((a, b) => a.datetime.localeCompare(b.datetime));

  return {
    withContract: rows.filter((row) => row.hasContract),
    withoutContract: rows.filter((row) => !row.hasContract || !row.vehiclePlate),
  };
}

// -------------------- Planning --------------------
type PlanningItem = {
  id: string;
  type: "RESERVA" | "BLOQUEO";
  label: string;
  vehiclePlate: string;
  groupLabel: string;
  modelLabel: string;
  startAt: string;
  endAt: string;
  status: "PETICION" | "RESERVA_CONFIRMADA" | "CONTRATADO" | "RESERVA_HUERFANA" | "NO_DISPONIBLE" | "BLOQUEADO";
  overlap: boolean;
  referenceId: string;
  contractId: string | null;
};

export async function listPlanning(input: {
  startDate: string;
  periodDays: number;
  plateFilter: string;
  groupFilter: string;
  modelFilter: string;
  branchFilter?: string;
}) {
  const data = await readRentalData();
  const from = parseDateSafe(`${input.startDate}T00:00:00`);
  if (!from) {
    throw new Error("Fecha de inicio de planning no válida");
  }
  const to = new Date(from);
  to.setDate(to.getDate() + input.periodDays);

  const periodStart = from.toISOString();
  const periodEnd = to.toISOString();
  const plateFilter = input.plateFilter.trim().toUpperCase();
  const groupFilter = input.groupFilter.trim().toUpperCase();
  const modelFilter = input.modelFilter.trim().toUpperCase();
  const branchFilter = (input.branchFilter ?? "").trim().toUpperCase();

  const planningItems: PlanningItem[] = [];

  // Construcción de items unificados de reservas y bloqueos.
  for (const reservation of data.reservations) {
    if (!hasOverlap(reservation.deliveryAt, reservation.pickupAt, periodStart, periodEnd)) {
      continue;
    }
    if (branchFilter) {
      const branchMatch =
        resolveBranchFromInput(reservation.branchDelivery, data.companySettings.branches)?.code ??
        normalizeBranchCode(reservation.branchDelivery);
      if (branchMatch !== branchFilter && !reservation.branchDelivery.toUpperCase().includes(branchFilter)) {
        continue;
      }
    }
    const assignedPlate = reservation.assignedPlate.toUpperCase();
    if (reservation.assignedPlate && plateFilter && !assignedPlate.includes(plateFilter)) {
      continue;
    }
    const fleetVehicle = reservation.assignedPlate
      ? data.fleetVehicles.find((item) => item.plate.toUpperCase() === assignedPlate)
      : null;
    const model = fleetVehicle ? data.vehicleModels.find((item) => item.id === fleetVehicle.modelId) : null;
    const category = fleetVehicle ? data.vehicleCategories.find((item) => item.id === fleetVehicle.categoryId) : null;
    const groupLabel = reservation.billedCarGroup || category?.code || category?.name || "N/D";
    const modelLabel = model ? `${model.brand} ${model.model}` : reservation.assignedPlate ? "N/D" : "Reserva huérfana";
    if (groupFilter && !groupLabel.toUpperCase().includes(groupFilter)) {
      continue;
    }
    if (modelFilter && !modelLabel.toUpperCase().includes(modelFilter)) {
      continue;
    }
    const hasContract = Boolean(reservation.contractId);
    const orphanConfirmed = !reservation.assignedPlate && reservation.reservationStatus === "CONFIRMADA";
    if (!reservation.assignedPlate && !orphanConfirmed) {
      continue;
    }
    const blockedAssignedPlate = Boolean(reservation.blockPlateForReservation && reservation.assignedPlate);
    planningItems.push({
      id: `reservation-${reservation.id}`,
      type: "RESERVA",
      label: reservation.reservationNumber,
      vehiclePlate: reservation.assignedPlate ? reservation.assignedPlate.toUpperCase() : `HUERFANA-${reservation.id}`,
      groupLabel,
      modelLabel,
      startAt: reservation.deliveryAt,
      endAt: reservation.pickupAt,
      status: blockedAssignedPlate
        ? "BLOQUEADO"
        : orphanConfirmed
        ? "RESERVA_HUERFANA"
        : hasContract
        ? "CONTRATADO"
        : reservation.reservationStatus === "PETICION"
          ? "PETICION"
          : "RESERVA_CONFIRMADA",
      overlap: false,
      referenceId: reservation.id,
      contractId: reservation.contractId || null,
    });
  }

  for (const block of data.vehicleBlocks) {
    if (!hasOverlap(block.startAt, block.endAt, periodStart, periodEnd)) {
      continue;
    }
    if (plateFilter && !block.vehiclePlate.toUpperCase().includes(plateFilter)) {
      continue;
    }
    const fleetVehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === block.vehiclePlate.toUpperCase());
    const model = fleetVehicle ? data.vehicleModels.find((item) => item.id === fleetVehicle.modelId) : null;
    const category = fleetVehicle ? data.vehicleCategories.find((item) => item.id === fleetVehicle.categoryId) : null;
    const groupLabel = category?.code || category?.name || "N/D";
    const modelLabel = model ? `${model.brand} ${model.model}` : "N/D";
    if (groupFilter && !groupLabel.toUpperCase().includes(groupFilter)) {
      continue;
    }
    if (modelFilter && !modelLabel.toUpperCase().includes(modelFilter)) {
      continue;
    }
    planningItems.push({
      id: `block-${block.id}`,
      type: "BLOQUEO",
      label: block.reason || "Bloqueo manual",
      vehiclePlate: block.vehiclePlate.toUpperCase(),
      groupLabel,
      modelLabel,
      startAt: block.startAt,
      endAt: block.endAt,
      status: "BLOQUEADO",
      overlap: false,
      referenceId: block.id,
      contractId: null,
    });
  }

  // Marcado de solapes por matrícula para visualización en planning.
  const byPlate: Record<string, PlanningItem[]> = {};
  for (const item of planningItems) {
    byPlate[item.vehiclePlate] = byPlate[item.vehiclePlate] ?? [];
    byPlate[item.vehiclePlate].push(item);
  }

  for (const items of Object.values(byPlate)) {
    items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (hasOverlap(items[i].startAt, items[i].endAt, items[j].startAt, items[j].endAt)) {
          items[i].overlap = true;
          items[j].overlap = true;
        }
      }
    }
  }

  const grouped: Record<
    string,
    Record<
      string,
      Array<{
        vehiclePlate: string;
        modelLabel: string;
        rowType: "MATRICULA" | "HUERFANA";
        items: PlanningItem[];
      }>
    >
  > = {};

  for (const [vehiclePlate, items] of Object.entries(byPlate)) {
    const first = items[0];
    const groupLabel = first.groupLabel || "N/D";
    const modelLabel = first.modelLabel || "N/D";
    grouped[groupLabel] = grouped[groupLabel] ?? {};
    grouped[groupLabel][modelLabel] = grouped[groupLabel][modelLabel] ?? [];
    grouped[groupLabel][modelLabel].push({
      vehiclePlate,
      modelLabel,
      rowType: vehiclePlate.startsWith("HUERFANA-") ? "HUERFANA" : "MATRICULA",
      items: items.toSorted((a, b) => a.startAt.localeCompare(b.startAt)),
    });
  }

  for (const vehicle of data.fleetVehicles) {
    if (vehicle.deactivatedAt) continue;
    const upperPlate = vehicle.plate.toUpperCase();
    if (plateFilter && !upperPlate.includes(plateFilter)) continue;
    const model = data.vehicleModels.find((item) => item.id === vehicle.modelId) ?? null;
    const category = data.vehicleCategories.find((item) => item.id === vehicle.categoryId) ?? null;
    const groupLabel = category?.code || category?.name || "N/D";
    const modelLabel = model ? `${model.brand} ${model.model}` : "N/D";
    if (groupFilter && !groupLabel.toUpperCase().includes(groupFilter)) continue;
    if (modelFilter && !modelLabel.toUpperCase().includes(modelFilter)) continue;
    grouped[groupLabel] = grouped[groupLabel] ?? {};
    grouped[groupLabel][modelLabel] = grouped[groupLabel][modelLabel] ?? [];
    const exists = grouped[groupLabel][modelLabel].some((row) => row.vehiclePlate.toUpperCase() === upperPlate);
    if (exists) continue;
    grouped[groupLabel][modelLabel].push({
      vehiclePlate: upperPlate,
      modelLabel,
      rowType: "MATRICULA",
      items: [],
    });
  }

  for (const category of data.vehicleCategories) {
    const groupLabel = category.code || category.name || "N/D";
    if (groupFilter && !groupLabel.toUpperCase().includes(groupFilter)) continue;
    grouped[groupLabel] = grouped[groupLabel] ?? {};
  }

  return Object.entries(grouped)
    .map(([groupLabel, models]) => ({
      groupLabel,
      models: Object.entries(models)
        .map(([modelLabel, rows]) => ({
          modelLabel,
          rows: rows.toSorted((a, b) => a.vehiclePlate.localeCompare(b.vehiclePlate)),
        }))
        .toSorted((a, b) => a.modelLabel.localeCompare(b.modelLabel)),
    }))
    .toSorted((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}

// -------------------- Clientes --------------------
export async function listClients(query: string, typeFilter: string): Promise<Client[]> {
  const data = await readRentalData();
  const q = query.trim().toLowerCase();
  const type = typeFilter.trim().toUpperCase();
  return data.clients
    .filter((client) => {
      const typeOk = !type || type === "TODOS" || client.clientType === type;
      if (!typeOk) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [
        client.clientCode,
        client.firstName,
        client.lastName,
        client.companyName,
        client.commissionerName,
        client.documentNumber,
        client.licenseNumber,
        client.email,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getNextClientCode(): Promise<string> {
  const data = await readRentalData();
  const next = data.counters.client + 1;
  return String(next);
}

export async function createClient(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const clientTypeRaw = (input.clientType ?? "PARTICULAR").toUpperCase();
  const clientType = (["PARTICULAR", "EMPRESA", "COMISIONISTA"] as const).includes(
    clientTypeRaw as "PARTICULAR" | "EMPRESA" | "COMISIONISTA",
  )
    ? (clientTypeRaw as "PARTICULAR" | "EMPRESA" | "COMISIONISTA")
    : "PARTICULAR";

  const documentNumber = (input.documentNumber ?? "").trim();
  const licenseNumber = (input.licenseNumber ?? "").trim();
  const duplicated = data.clients.find(
    (client) =>
      (documentNumber && client.documentNumber.toLowerCase() === documentNumber.toLowerCase()) ||
      (licenseNumber && client.licenseNumber.toLowerCase() === licenseNumber.toLowerCase()),
  );
  const allowDuplicateLoad = input.allowDuplicateLoad === "true";

  if (duplicated && !allowDuplicateLoad) {
    throw new Error(`Duplicado detectado. Cliente existente: ${duplicated.clientCode}`);
  }

  if (duplicated && allowDuplicateLoad) {
    return duplicated;
  }

  data.counters.client += 1;
  const clientCode = String(data.counters.client);

  const client: Client = {
    id: clientCode,
    clientCode,
    clientType,
    referenceCode: (input.referenceCode ?? "").trim(),
    groupCode: (input.groupCode ?? "").trim(),
    gender: (input.gender ?? "").trim(),
    firstName: (input.firstName ?? "").trim(),
    lastName: (input.lastName ?? "").trim(),
    companyName: (input.companyName ?? "").trim(),
    commissionerName: (input.commissionerName ?? "").trim(),
    commissionPercent: parseNumber(input.commissionPercent ?? "0"),
    nationality: (input.nationality ?? "").trim(),
    language: (input.language ?? "").trim(),
    documentType: (input.documentType ?? "").trim(),
    documentNumber,
    documentIssuedAt: (input.documentIssuedAt ?? "").trim(),
    documentExpiresAt: (input.documentExpiresAt ?? "").trim(),
    licenseNumber,
    licenseType: (input.licenseType ?? "").trim(),
    licenseIssuedAt: (input.licenseIssuedAt ?? "").trim(),
    licenseExpiresAt: (input.licenseExpiresAt ?? "").trim(),
    email: (input.email ?? "").trim(),
    phone1: (input.phone1 ?? "").trim(),
    phone2: (input.phone2 ?? "").trim(),
    birthDate: (input.birthDate ?? "").trim(),
    birthPlace: (input.birthPlace ?? "").trim(),
    residenceAddress: "",
    vacationAddress: "",
    residenceStreet: (input.residenceStreet ?? "").trim(),
    residenceCity: (input.residenceCity ?? "").trim(),
    residencePostalCode: (input.residencePostalCode ?? "").trim(),
    residenceRegion: (input.residenceRegion ?? "").trim(),
    residenceCountry: (input.residenceCountry ?? "").trim(),
    vacationStreet: (input.vacationStreet ?? "").trim(),
    vacationCity: (input.vacationCity ?? "").trim(),
    vacationPostalCode: (input.vacationPostalCode ?? "").trim(),
    vacationRegion: (input.vacationRegion ?? "").trim(),
    vacationCountry: (input.vacationCountry ?? "").trim(),
    acquisitionChannel: (input.acquisitionChannel ?? "").trim(),
    paymentMethod: (input.paymentMethod ?? "").trim(),
    paymentDay: (input.paymentDay ?? "").trim(),
    saleWindowDay: (input.saleWindowDay ?? "").trim(),
    contactPerson: (input.contactPerson ?? "").trim(),
    web: (input.web ?? "").trim(),
    bankChargeIban: (input.bankChargeIban ?? "").trim(),
    bankChargeBic: (input.bankChargeBic ?? "").trim(),
    bankAbonoIban: (input.bankAbonoIban ?? "").trim(),
    bankAbonoBic: (input.bankAbonoBic ?? "").trim(),
    branchBelongingCode: (input.branchBelongingCode ?? "").trim(),
    includeMailing: input.includeMailing === "true",
    accountBlocked: input.accountBlocked === "true",
    notes: (input.notes ?? "").trim(),
    warnings: (input.warnings ?? "").trim(),
    taxExemption: (input.taxExemption ?? "").trim(),
    companyOwnDrivers: input.companyOwnDrivers === "true",
    groupedBilling: input.groupedBilling === "true",
    isAffiliate: input.isAffiliate === "true",
    advanceMonthlyBilling: input.advanceMonthlyBilling === "true",
    forceDeductibleCharge: input.forceDeductibleCharge === "true",
    taxId: (input.taxId ?? "").trim(),
    fiscalAddress: (input.fiscalAddress ?? "").trim(),
    associatedRate: (input.associatedRate ?? "").trim(),
    companyDriverCompanyId: (input.companyDriverCompanyId ?? "").trim(),
    companyDrivers: (input.companyDrivers ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };
  client.residenceAddress = [
    client.residenceStreet,
    client.residenceCity,
    client.residencePostalCode,
    client.residenceRegion,
    client.residenceCountry,
  ]
    .filter(Boolean)
    .join(", ");
  client.vacationAddress = [
    client.vacationStreet,
    client.vacationCity,
    client.vacationPostalCode,
    client.vacationRegion,
    client.vacationCountry,
  ]
    .filter(Boolean)
    .join(", ");

  if (client.clientType === "PARTICULAR") {
    const missing = [
      client.firstName,
      client.lastName,
      client.nationality,
      client.language,
      client.documentType,
      client.documentNumber,
      client.licenseNumber,
      client.email,
      client.phone1,
      client.birthDate,
      client.birthPlace,
      client.residenceStreet,
      client.residenceCity,
      client.residenceCountry,
      client.vacationStreet,
      client.vacationCity,
      client.vacationCountry,
    ].some((value) => !value);
    if (missing) {
      throw new Error("Faltan campos obligatorios de cliente particular");
    }
  } else {
    if (!client.companyName || !client.taxId || !client.fiscalAddress || !client.email) {
      throw new Error("Faltan campos fiscales obligatorios de empresa/comisionista");
    }
  }

  data.clients.push(client);
  await writeRentalData(data);

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "client",
    entityId: client.id,
    details: { clientCode: client.clientCode, clientType: client.clientType },
  });

  return client;
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const data = await readRentalData();
  return data.clients.find((client) => client.id === clientId) ?? null;
}

export async function listClientReservations(clientId: string): Promise<Reservation[]> {
  const data = await readRentalData();
  return data.reservations
    .filter((reservation) => reservation.customerId === clientId)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type ClientHistorySummary = {
  reservationsCount: number;
  contractsCount: number;
  openContractsCount: number;
  closedContractsCount: number;
  reservationsTotalAmount: number;
  contractedTotalAmount: number;
  invoicedTotalAmount: number;
  lastReservationAt: string;
};

export async function getClientHistorySummary(clientId: string): Promise<ClientHistorySummary> {
  const data = await readRentalData();
  const reservations = data.reservations.filter((reservation) => reservation.customerId === clientId);
  const contractsById = new Map(data.contracts.map((contract) => [contract.id, contract]));
  const invoicesByContractId = new Map(data.invoices.map((invoice) => [invoice.contractId, invoice]));

  const reservationsTotalAmount = reservations.reduce((sum, reservation) => sum + reservation.totalPrice, 0);
  const contracts = reservations
    .map((reservation) => (reservation.contractId ? contractsById.get(reservation.contractId) ?? null : null))
    .filter((contract): contract is Contract => Boolean(contract));
  const contractedTotalAmount = contracts.reduce((sum, contract) => sum + contract.totalSettlement, 0);
  const invoicedTotalAmount = contracts.reduce((sum, contract) => {
    const invoice = invoicesByContractId.get(contract.id);
    return sum + (invoice?.totalAmount ?? 0);
  }, 0);

  return {
    reservationsCount: reservations.length,
    contractsCount: contracts.length,
    openContractsCount: contracts.filter((contract) => contract.status === "ABIERTO").length,
    closedContractsCount: contracts.filter((contract) => contract.status === "CERRADO").length,
    reservationsTotalAmount,
    contractedTotalAmount,
    invoicedTotalAmount,
    lastReservationAt: reservations[0]?.createdAt ?? "",
  };
}

export type ClientCommissionSummaryRow = {
  clientId: string | null;
  subjectType: "CLIENTE" | "COMISIONISTA";
  subjectName: string;
  commissionPercent: number;
  reservationsCount: number;
  contractedCount: number;
  reservationsAmount: number;
  contractedAmount: number;
  commissionReservationsAmount: number;
  commissionContractedAmount: number;
};

export async function listClientCommissionSummary(): Promise<ClientCommissionSummaryRow[]> {
  const data = await readRentalData();
  const clientsById = new Map(data.clients.map((client) => [client.id, client]));
  const grouped = new Map<string, ClientCommissionSummaryRow>();
  const commissionerByName = new Map(
    data.clients
      .filter((client) => client.clientType === "COMISIONISTA")
      .map((client) => [
        (client.commissionerName || client.companyName || client.clientCode).trim().toLowerCase(),
        client,
      ]),
  );

  function upsertRow(input: {
    key: string;
    clientId: string | null;
    subjectType: "CLIENTE" | "COMISIONISTA";
    subjectName: string;
    commissionPercent: number;
    reservationAmount: number;
    contractedAmount: number;
    contracted: boolean;
  }) {
    const current = grouped.get(input.key) ?? {
      clientId: input.clientId,
      subjectType: input.subjectType,
      subjectName: input.subjectName,
      commissionPercent: input.commissionPercent,
      reservationsCount: 0,
      contractedCount: 0,
      reservationsAmount: 0,
      contractedAmount: 0,
      commissionReservationsAmount: 0,
      commissionContractedAmount: 0,
    };
    current.reservationsCount += 1;
    current.reservationsAmount += input.reservationAmount;
    current.commissionReservationsAmount += (input.reservationAmount * input.commissionPercent) / 100;
    if (input.contracted) {
      current.contractedCount += 1;
      current.contractedAmount += input.contractedAmount;
      current.commissionContractedAmount += (input.contractedAmount * input.commissionPercent) / 100;
    }
    grouped.set(input.key, current);
  }

  for (const reservation of data.reservations) {
    const customerClient = reservation.customerId ? clientsById.get(reservation.customerId) ?? null : null;
    const contract = reservation.contractId ? data.contracts.find((item) => item.id === reservation.contractId) ?? null : null;
    const contractedAmount = contract?.totalSettlement ?? reservation.totalPrice;
    const reservationAmount = reservation.totalPrice;

    const commissionerName = reservation.customerCommissioner.trim();
    const normalizedCommissionerName = commissionerName.toLowerCase();
    const commissionerClient = normalizedCommissionerName ? commissionerByName.get(normalizedCommissionerName) ?? null : null;
    if (commissionerName) {
      const resolvedName =
        commissionerClient?.commissionerName || commissionerClient?.companyName || commissionerClient?.clientCode || commissionerName;
      const percent = commissionerClient?.commissionPercent ?? 0;
      upsertRow({
        key: `COMISIONISTA|${commissionerClient?.id ?? normalizedCommissionerName}`,
        clientId: commissionerClient?.id ?? null,
        subjectType: "COMISIONISTA",
        subjectName: resolvedName,
        commissionPercent: percent,
        reservationAmount,
        contractedAmount,
        contracted: Boolean(reservation.contractId),
      });
      continue;
    }

    if (customerClient) {
      const name = [customerClient.firstName, customerClient.lastName].join(" ").trim() || customerClient.companyName || customerClient.clientCode;
      const percent = customerClient.commissionPercent ?? 0;
      upsertRow({
        key: `CLIENTE|${customerClient.id}`,
        clientId: customerClient.id,
        subjectType: "CLIENTE",
        subjectName: name,
        commissionPercent: percent,
        reservationAmount,
        contractedAmount,
        contracted: Boolean(reservation.contractId),
      });
    }
  }

  return Array.from(grouped.values())
    .filter((row) => row.reservationsCount > 0)
    .toSorted((a, b) => b.commissionContractedAmount - a.commissionContractedAmount || b.reservationsAmount - a.reservationsAmount);
}

export async function deactivateClient(clientId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) {
    throw new Error("Cliente no encontrado");
  }
  const hasAnyContractHistory = data.reservations.some(
    (reservation) => reservation.customerId === clientId && Boolean(reservation.contractId),
  );
  if (hasAnyContractHistory) {
    throw new Error("No se puede dar de baja un cliente con contratos históricos");
  }
  client.accountBlocked = true;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "client_deactivate",
    entityId: client.id,
    details: { clientCode: client.clientCode },
  });
}

export async function updateClient(clientId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) {
    throw new Error("Cliente no encontrado");
  }

  client.firstName = (input.firstName ?? client.firstName).trim();
  client.lastName = (input.lastName ?? client.lastName).trim();
  client.companyName = (input.companyName ?? client.companyName).trim();
  client.documentType = (input.documentType ?? client.documentType).trim();
  client.documentNumber = (input.documentNumber ?? client.documentNumber).trim();
  client.licenseNumber = (input.licenseNumber ?? client.licenseNumber).trim();
  client.email = (input.email ?? client.email).trim();
  client.phone1 = (input.phone1 ?? client.phone1).trim();
  client.phone2 = (input.phone2 ?? client.phone2).trim();
  client.language = (input.language ?? client.language).trim();
  client.paymentMethod = (input.paymentMethod ?? client.paymentMethod).trim();
  if (input.commissionPercent !== undefined) {
    client.commissionPercent = parseNumber(input.commissionPercent);
  }
  client.notes = (input.notes ?? client.notes).trim();
  client.warnings = (input.warnings ?? client.warnings).trim();

  if (client.clientType === "PARTICULAR") {
    client.birthDate = (input.birthDate ?? client.birthDate).trim();
    client.birthPlace = (input.birthPlace ?? client.birthPlace).trim();
    client.documentIssuedAt = (input.documentIssuedAt ?? client.documentIssuedAt).trim();
    client.documentExpiresAt = (input.documentExpiresAt ?? client.documentExpiresAt).trim();
    client.licenseIssuedAt = (input.licenseIssuedAt ?? client.licenseIssuedAt).trim();
    client.licenseExpiresAt = (input.licenseExpiresAt ?? client.licenseExpiresAt).trim();
    client.residenceStreet = (input.residenceStreet ?? client.residenceStreet).trim();
    client.residenceCity = (input.residenceCity ?? client.residenceCity).trim();
    client.residencePostalCode = (input.residencePostalCode ?? client.residencePostalCode).trim();
    client.residenceRegion = (input.residenceRegion ?? client.residenceRegion).trim();
    client.residenceCountry = (input.residenceCountry ?? client.residenceCountry).trim();
    client.vacationStreet = (input.vacationStreet ?? client.vacationStreet).trim();
    client.vacationCity = (input.vacationCity ?? client.vacationCity).trim();
    client.vacationPostalCode = (input.vacationPostalCode ?? client.vacationPostalCode).trim();
    client.vacationRegion = (input.vacationRegion ?? client.vacationRegion).trim();
    client.vacationCountry = (input.vacationCountry ?? client.vacationCountry).trim();
  } else {
    client.taxId = (input.taxId ?? client.taxId).trim();
    client.fiscalAddress = (input.fiscalAddress ?? client.fiscalAddress).trim();
  }

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "client_update",
    entityId: client.id,
    details: { clientCode: client.clientCode },
  });
}

export async function deleteClient(clientId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) {
    throw new Error("Cliente no encontrado");
  }
  if (data.reservations.some((reservation) => reservation.customerId === clientId)) {
    throw new Error("No se puede borrar cliente con reservas asociadas");
  }
  data.clients = data.clients.filter((item) => item.id !== clientId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "client_delete",
    entityId: client.id,
    details: { clientCode: client.clientCode },
  });
}

// -------------------- Catálogo y flota --------------------
export async function listVehicleModels(): Promise<VehicleModel[]> {
  const data = await readRentalData();
  return data.vehicleModels.toSorted(
    (a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model),
  );
}

export async function createVehicleModel(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const model: VehicleModel = {
    id: crypto.randomUUID(),
    brand: (input.brand ?? "").trim(),
    model: (input.model ?? "").trim(),
    transmission: input.transmission === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL",
    features: (input.features ?? "").trim(),
    fuelType: (input.fuelType ?? "").trim(),
    categoryId: (input.categoryId ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };

  if (!model.brand || !model.model) {
    throw new Error("Marca y modelo son obligatorios");
  }
  if (data.vehicleModels.some((item) => item.brand.trim().toUpperCase() === model.brand.toUpperCase() && item.model.trim().toUpperCase() === model.model.toUpperCase())) {
    throw new Error("Ya existe un modelo con esa marca y nombre");
  }

  data.vehicleModels.push(model);
  await writeRentalData(data);
}

export async function updateVehicleModel(modelId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const model = data.vehicleModels.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("Modelo no encontrado");
  }
  model.brand = (input.brand ?? model.brand).trim();
  model.model = (input.model ?? model.model).trim();
  model.transmission = input.transmission === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL";
  model.features = (input.features ?? model.features).trim();
  model.fuelType = (input.fuelType ?? model.fuelType).trim();
  model.categoryId = (input.categoryId ?? model.categoryId).trim();
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_model_update",
    entityId: model.id,
    details: { brand: model.brand, model: model.model },
  });
}

export async function deleteVehicleModel(modelId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const model = data.vehicleModels.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("Modelo no encontrado");
  }
  if (data.fleetVehicles.some((item) => item.modelId === modelId)) {
    throw new Error("No se puede borrar modelo con matrículas asociadas");
  }
  data.vehicleModels = data.vehicleModels.filter((item) => item.id !== modelId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_model_delete",
    entityId: model.id,
    details: { brand: model.brand, model: model.model },
  });
}

export async function listVehicleCategories(): Promise<VehicleCategory[]> {
  const data = await readRentalData();
  return data.vehicleCategories.toSorted((a, b) => a.code.localeCompare(b.code));
}

export async function createVehicleCategory(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const name = (input.name ?? "").trim();
  const code = (input.code ?? "").trim().toUpperCase().replace(/\s+/g, "-") || name.toUpperCase().replace(/\s+/g, "-");
  const category: VehicleCategory = {
    id: crypto.randomUUID(),
    code,
    name,
    summary: (input.summary ?? "").trim(),
    transmissionRequired: input.transmissionRequired === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL",
    minSeats: parseNumber(input.minSeats ?? "0"),
    minDoors: parseNumber(input.minDoors ?? "0"),
    minLuggage: parseNumber(input.minLuggage ?? "0"),
    fuelType: (input.fuelType ?? "").trim(),
    airConditioning: input.airConditioning === "true",
    insurancePrice: parseNumber(input.insurancePrice ?? "0"),
    deductiblePrice: parseNumber(input.deductiblePrice ?? "0"),
    depositPrice: parseNumber(input.depositPrice ?? "0"),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };

  if (!category.name) {
    throw new Error("Nombre de categoría obligatorio");
  }
  const duplicated = data.vehicleCategories.find((item) => item.code === category.code);
  if (duplicated) {
    throw new Error("Ya existe una categoría con ese código/nombre");
  }
  data.vehicleCategories.push(category);
  await writeRentalData(data);
}

export async function updateVehicleCategory(
  categoryId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const category = data.vehicleCategories.find((item) => item.id === categoryId);
  if (!category) {
    throw new Error("Categoría no encontrada");
  }
  category.name = (input.name ?? category.name).trim();
  category.code = (input.code ?? category.code).trim().toUpperCase();
  category.summary = (input.summary ?? category.summary).trim();
  category.transmissionRequired = input.transmissionRequired === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL";
  category.minSeats = parseNumber(input.minSeats ?? String(category.minSeats));
  category.minDoors = parseNumber(input.minDoors ?? String(category.minDoors));
  category.minLuggage = parseNumber(input.minLuggage ?? String(category.minLuggage));
  category.fuelType = (input.fuelType ?? category.fuelType).trim();
  category.airConditioning = input.airConditioning === "true";
  category.insurancePrice = parseNumber(input.insurancePrice ?? String(category.insurancePrice));
  category.deductiblePrice = parseNumber(input.deductiblePrice ?? String(category.deductiblePrice));
  category.depositPrice = parseNumber(input.depositPrice ?? String(category.depositPrice));
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_category_update",
    entityId: category.id,
    details: { code: category.code, name: category.name },
  });
}

export async function deleteVehicleCategory(categoryId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const category = data.vehicleCategories.find((item) => item.id === categoryId);
  if (!category) {
    throw new Error("Categoría no encontrada");
  }
  if (data.fleetVehicles.some((item) => item.categoryId === categoryId)) {
    throw new Error("No se puede borrar categoría con matrículas asociadas");
  }
  data.vehicleCategories = data.vehicleCategories.filter((item) => item.id !== categoryId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_category_delete",
    entityId: category.id,
    details: { code: category.code, name: category.name },
  });
}

export async function listFleetVehicles(): Promise<
  Array<FleetVehicle & { modelLabel: string; categoryLabel: string; activeContracts: number; status: "ALTA" | "BAJA" }>
> {
  const data = await readRentalData();
  return data.fleetVehicles
    .map((vehicle) => {
      const model = data.vehicleModels.find((item) => item.id === vehicle.modelId);
      const category = data.vehicleCategories.find((item) => item.id === vehicle.categoryId);
      const activeContracts = data.contracts.filter(
        (contract) => contract.vehiclePlate.toUpperCase() === vehicle.plate.toUpperCase() && contract.status === "ABIERTO",
      ).length;
      return {
        ...vehicle,
        modelLabel: model ? `${model.brand} ${model.model}` : "N/D",
        categoryLabel: category ? `${category.code} - ${category.name}` : "N/D",
        activeContracts,
        status: vehicle.deactivatedAt ? ("BAJA" as const) : ("ALTA" as const),
      };
    })
    .toSorted(
      (a, b) =>
        a.categoryLabel.localeCompare(b.categoryLabel) ||
        a.modelLabel.localeCompare(b.modelLabel) ||
        a.plate.localeCompare(b.plate),
    );
}

export async function listVehicleExtras(): Promise<VehicleExtra[]> {
  const data = await readRentalData();
  return data.vehicleExtras.toSorted((a, b) => a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code));
}

export async function createVehicleExtra(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const code = (input.code ?? "").trim().toUpperCase();
  const name = (input.name ?? "").trim();
  const kind = input.kind === "EXTRA" ? "EXTRA" : "SEGURO";
  if (!code || !name) throw new Error("Código y nombre del extra son obligatorios");
  if (data.vehicleExtras.some((item) => item.code === code)) throw new Error("Ya existe un extra con ese código");
  const extra: VehicleExtra = {
    id: crypto.randomUUID(),
    code,
    name,
    kind,
    priceMode: input.priceMode === "POR_DIA" ? "POR_DIA" : "FIJO",
    unitPrice: parseNumber(input.unitPrice ?? "0"),
    maxDays: parseNumber(input.maxDays ?? "0"),
    active: input.active === "false" ? false : true,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };
  data.vehicleExtras.push(extra);
  await writeRentalData(data);
}

export async function updateVehicleExtra(extraId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const extra = data.vehicleExtras.find((item) => item.id === extraId);
  if (!extra) throw new Error("Extra no encontrado");
  extra.code = (input.code ?? extra.code).trim().toUpperCase();
  extra.name = (input.name ?? extra.name).trim();
  extra.kind = input.kind === "EXTRA" ? "EXTRA" : "SEGURO";
  extra.priceMode = input.priceMode === "POR_DIA" ? "POR_DIA" : "FIJO";
  extra.unitPrice = parseNumber(input.unitPrice ?? String(extra.unitPrice));
  extra.maxDays = parseNumber(input.maxDays ?? String(extra.maxDays));
  extra.active = input.active === "false" ? false : true;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_extra_update",
    entityId: extra.id,
    details: { code: extra.code, name: extra.name },
  });
}

export async function deleteVehicleExtra(extraId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const extra = data.vehicleExtras.find((item) => item.id === extraId);
  if (!extra) throw new Error("Extra no encontrado");
  data.vehicleExtras = data.vehicleExtras.filter((item) => item.id !== extraId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_extra_delete",
    entityId: extra.id,
    details: { code: extra.code, name: extra.name },
  });
}

export async function createFleetVehicle(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const plate = (input.plate ?? "").trim().toUpperCase();
  if (!plate || !input.modelId || !input.activeFrom) {
    throw new Error("Faltan campos obligatorios de flota");
  }
  if (data.vehicleCategories.length === 0) {
    throw new Error("Debes crear primero al menos una categoría");
  }

  const exists = data.fleetVehicles.find((item) => item.plate === plate);
  if (exists) {
    throw new Error("La matrícula ya existe en flota");
  }

  const modelId = (input.modelId ?? "").trim();
  const model = data.vehicleModels.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("Modelo no encontrado");
  }
  const categoryId = (input.categoryId ?? "").trim() || model.categoryId;
  if (!categoryId) {
    throw new Error("El modelo no tiene grupo asignado");
  }

  const vehicle: FleetVehicle = {
    id: crypto.randomUUID(),
    plate,
    modelId,
    categoryId,
    owner: normalizeOwnerName(input.owner ?? ""),
    color: (input.color ?? "").trim(),
    year: parseNumber(input.year ?? "0"),
    vin: (input.vin ?? "").trim(),
    odometerKm: parseNumber(input.odometerKm ?? "0"),
    fuelType: (input.fuelType ?? "").trim() || model.fuelType || "",
    activeFrom: (input.activeFrom ?? "").trim(),
    activeUntil: (input.activeUntil ?? "").trim(),
    acquisitionCost: parseNumber(input.acquisitionCost ?? "0"),
    alertNotes: (input.alertNotes ?? "").trim(),
    deactivatedAt: "",
    deactivationReason: "",
    deactivationAmount: 0,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
  };
  data.fleetVehicles.push(vehicle);
  await writeRentalData(data);
}

export async function updateFleetVehicle(vehicleId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const vehicle = data.fleetVehicles.find((item) => item.id === vehicleId);
  if (!vehicle) {
    throw new Error("Vehículo no encontrado");
  }
  vehicle.categoryId = (input.categoryId ?? vehicle.categoryId).trim();
  vehicle.owner = normalizeOwnerName(input.owner ?? vehicle.owner);
  vehicle.color = (input.color ?? vehicle.color).trim();
  vehicle.year = parseNumber(input.year ?? String(vehicle.year));
  vehicle.vin = (input.vin ?? vehicle.vin).trim();
  vehicle.odometerKm = parseNumber(input.odometerKm ?? String(vehicle.odometerKm));
  vehicle.fuelType = (input.fuelType ?? vehicle.fuelType).trim();
  vehicle.activeFrom = (input.activeFrom ?? vehicle.activeFrom).trim();
  vehicle.activeUntil = (input.activeUntil ?? vehicle.activeUntil).trim();
  vehicle.acquisitionCost = parseNumber(input.acquisitionCost ?? String(vehicle.acquisitionCost));
  vehicle.alertNotes = (input.alertNotes ?? vehicle.alertNotes).trim();
  if ((input.deactivatedAt ?? "").trim()) {
    vehicle.deactivatedAt = (input.deactivatedAt ?? "").trim();
    vehicle.deactivationReason = (input.deactivationReason ?? vehicle.deactivationReason).trim();
    vehicle.deactivationAmount = parseNumber(input.deactivationAmount ?? String(vehicle.deactivationAmount));
  }
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "fleet_vehicle_update",
    entityId: vehicle.id,
    details: { plate: vehicle.plate },
  });
}

export async function registerFleetVehicleDrop(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const plate = (input.plate ?? "").trim().toUpperCase();
  const vehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === plate);
  if (!vehicle) {
    throw new Error("Matrícula no encontrada");
  }
  const deactivatedAt = (input.deactivatedAt ?? "").trim();
  if (!deactivatedAt) {
    throw new Error("Fecha de baja obligatoria");
  }
  vehicle.deactivatedAt = deactivatedAt;
  vehicle.deactivationReason = (input.deactivationReason ?? "").trim();
  vehicle.deactivationAmount = parseNumber(input.deactivationAmount ?? "0");
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "fleet_vehicle_drop",
    entityId: vehicle.id,
    details: {
      plate: vehicle.plate,
      deactivatedAt: vehicle.deactivatedAt,
      reason: vehicle.deactivationReason,
      amount: vehicle.deactivationAmount,
    },
  });
}

export async function deleteFleetVehicle(vehicleId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const vehicle = data.fleetVehicles.find((item) => item.id === vehicleId);
  if (!vehicle) {
    throw new Error("Vehículo no encontrado");
  }
  const plate = vehicle.plate.toUpperCase();
  const hasLinks =
    data.reservations.some((item) => item.assignedPlate.toUpperCase() === plate) ||
    data.contracts.some((item) => item.vehiclePlate.toUpperCase() === plate) ||
    data.internalExpenses.some((item) => item.vehiclePlate.toUpperCase() === plate) ||
    data.vehicleTasks.some((item) => item.plate.toUpperCase() === plate) ||
    data.vehicleBlocks.some((item) => item.vehiclePlate.toUpperCase() === plate);
  if (hasLinks) {
    throw new Error("No se puede borrar matrícula con histórico asociado");
  }
  data.fleetVehicles = data.fleetVehicles.filter((item) => item.id !== vehicleId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "fleet_vehicle_delete",
    entityId: vehicle.id,
    details: { plate: vehicle.plate },
  });
}

export async function getVehicleRentalHistory(plateQuery: string): Promise<Reservation[]> {
  const data = await readRentalData();
  const plate = plateQuery.trim().toUpperCase();
  if (!plate) {
    return [];
  }
  return data.reservations
    .filter((reservation) => reservation.assignedPlate.toUpperCase() === plate)
    .toSorted((a, b) => b.deliveryAt.localeCompare(a.deliveryAt));
}

export async function getVehicleProductionSummary(input: { from: string; to: string }) {
  const data = await readRentalData();
  const vehicles = data.fleetVehicles;

  const summary = vehicles.map((vehicle) => {
    const contracts = data.contracts.filter(
      (contract) =>
        contract.vehiclePlate.toUpperCase() === vehicle.plate.toUpperCase() &&
        isInsideRange(contract.deliveryAt, input.from, input.to),
    );
    const income = contracts.reduce((sum, contract) => sum + contract.totalSettlement, 0);
    const expenses = data.internalExpenses
      .filter(
        (expense) =>
          expense.vehiclePlate.toUpperCase() === vehicle.plate.toUpperCase() &&
          isInsideRange(`${expense.expenseDate}T12:00:00`, input.from, input.to),
      )
      .reduce((sum, expense) => sum + expense.amount, 0);
    const costBase = vehicle.acquisitionCost || 0;
    return {
      plate: vehicle.plate,
      income,
      expenses,
      costBase,
      profitability: income - expenses - costBase,
    };
  });

  return summary.toSorted((a, b) => a.plate.localeCompare(b.plate));
}

export async function listVehicleTasks(input: { status?: string; plate?: string }) {
  const data = await readRentalData();
  const statusFilter = (input.status ?? "").trim().toUpperCase();
  const plateFilter = (input.plate ?? "").trim().toUpperCase();
  return data.vehicleTasks
    .filter((task) => {
      if (statusFilter && statusFilter !== "TODOS" && task.status !== statusFilter) {
        return false;
      }
      if (plateFilter && !task.plate.toUpperCase().includes(plateFilter)) {
        return false;
      }
      return true;
    })
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function createVehicleTask(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const plate = (input.plate ?? "").trim().toUpperCase();
  if (!plate) {
    throw new Error("Matrícula obligatoria");
  }
  const existsVehicle = data.fleetVehicles.find((item) => item.plate.toUpperCase() === plate);
  if (!existsVehicle) {
    throw new Error("La matrícula no existe en flota");
  }
  const taskTypeRaw = (input.taskType ?? "MANTENIMIENTO").trim().toUpperCase();
  const taskType = (["LIMPIEZA", "MANTENIMIENTO", "ITV", "REVISION"] as const).includes(
    taskTypeRaw as "LIMPIEZA" | "MANTENIMIENTO" | "ITV" | "REVISION",
  )
    ? (taskTypeRaw as "LIMPIEZA" | "MANTENIMIENTO" | "ITV" | "REVISION")
    : "MANTENIMIENTO";
  const dueDate = (input.dueDate ?? "").trim();
  if (!parseDateSafe(`${dueDate}T00:00:00`)) {
    throw new Error("Fecha objetivo no válida");
  }
  const task: VehicleTask = {
    id: crypto.randomUUID(),
    plate,
    taskType,
    title: (input.title ?? "").trim() || taskType,
    dueDate,
    status: "PENDIENTE",
    notes: (input.notes ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  data.vehicleTasks.push(task);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_task_create",
    entityId: task.id,
    details: { plate: task.plate, taskType: task.taskType, dueDate: task.dueDate },
  });
}

export async function updateVehicleTaskStatus(
  taskId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const task = data.vehicleTasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Tarea no encontrada");
  }
  const statusRaw = (input.status ?? "").trim().toUpperCase();
  const nextStatus = (["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"] as const).includes(
    statusRaw as "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA",
  )
    ? (statusRaw as "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA")
    : task.status;
  task.status = nextStatus;
  if ((input.notes ?? "").trim()) {
    task.notes = (input.notes ?? "").trim();
  }
  task.updatedAt = new Date().toISOString();
  task.updatedBy = actor.id;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_task_status",
    entityId: task.id,
    details: { plate: task.plate, status: task.status },
  });
}

export async function updateVehicleTask(taskId: string, input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const task = data.vehicleTasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Tarea no encontrada");
  }
  const plate = (input.plate ?? task.plate).trim().toUpperCase();
  if (!data.fleetVehicles.some((item) => item.plate.toUpperCase() === plate)) {
    throw new Error("La matrícula no existe en flota");
  }
  const taskTypeRaw = (input.taskType ?? task.taskType).trim().toUpperCase();
  const taskType = (["LIMPIEZA", "MANTENIMIENTO", "ITV", "REVISION"] as const).includes(
    taskTypeRaw as "LIMPIEZA" | "MANTENIMIENTO" | "ITV" | "REVISION",
  )
    ? (taskTypeRaw as "LIMPIEZA" | "MANTENIMIENTO" | "ITV" | "REVISION")
    : task.taskType;
  const dueDate = (input.dueDate ?? task.dueDate).trim();
  if (!parseDateSafe(`${dueDate}T00:00:00`)) {
    throw new Error("Fecha objetivo no válida");
  }
  task.plate = plate;
  task.taskType = taskType;
  task.title = (input.title ?? task.title).trim() || taskType;
  task.dueDate = dueDate;
  if ((input.status ?? "").trim()) {
    const statusRaw = (input.status ?? "").trim().toUpperCase();
    if ((["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"] as const).includes(
      statusRaw as "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA",
    )) {
      task.status = statusRaw as "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
    }
  }
  if ((input.notes ?? "").trim()) {
    task.notes = (input.notes ?? "").trim();
  }
  task.updatedAt = new Date().toISOString();
  task.updatedBy = actor.id;
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_task_update",
    entityId: task.id,
    details: { plate: task.plate, taskType: task.taskType, status: task.status, dueDate: task.dueDate },
  });
}

export async function deleteVehicleTask(taskId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const task = data.vehicleTasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Tarea no encontrada");
  }
  data.vehicleTasks = data.vehicleTasks.filter((item) => item.id !== taskId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "vehicle_task_delete",
    entityId: task.id,
    details: { plate: task.plate, taskType: task.taskType },
  });
}

export async function listVehicleTaskAlerts(input: { daysAhead: number }) {
  const tasks = await listVehicleTasks({ status: "PENDIENTE" });
  const now = new Date();
  const to = new Date();
  to.setDate(to.getDate() + input.daysAhead);
  return tasks.filter((task) => {
    const due = parseDateSafe(`${task.dueDate}T23:59:59`);
    if (!due) {
      return false;
    }
    return due >= now && due <= to;
  });
}

// -------------------- Tarifas configurables por empresa --------------------
export async function listTariffPlans(query: string) {
  const data = await readRentalData();
  const q = query.trim().toLowerCase();
  return data.tariffPlans
    .filter((plan) => {
      if (!q) {
        return true;
      }
      return [plan.code, plan.title, plan.season].join(" ").toLowerCase().includes(q);
    })
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createTariffPlan(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const code = (input.code ?? "").trim().toUpperCase();
  const title = (input.title ?? "").trim();
  if (!code || !title) {
    throw new Error("Código y título de tarifa son obligatorios");
  }
  const duplicated = data.tariffPlans.find(
    (item) =>
      item.code === code &&
      (item.season ?? "").trim().toUpperCase() === (input.season ?? "").trim().toUpperCase() &&
      (item.validFrom ?? "").trim() === (input.validFrom ?? "").trim() &&
      (item.validTo ?? "").trim() === (input.validTo ?? "").trim(),
  );
  if (duplicated) {
    throw new Error("Ya existe una tarifa con ese código y periodo");
  }
  const plan: TariffPlan = {
    id: crypto.randomUUID(),
    code,
    title,
    season: (input.season ?? "").trim(),
    validFrom: (input.validFrom ?? "").trim(),
    validTo: (input.validTo ?? "").trim(),
    courtesyHours: Math.max(0, parseNumber(input.courtesyHours ?? "0")),
    priceMode:
      input.priceMode === "PRECIO_B" ? "PRECIO_B" : input.priceMode === "PRECIO_C" ? "PRECIO_C" : "PRECIO_A",
    active: input.active === "false" ? false : true,
    notes: (input.notes ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  data.tariffPlans.push(plan);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "tariff_plan",
    entityId: plan.id,
    details: { code: plan.code, title: plan.title },
  });
}

export async function updateTariffPlan(
  tariffPlanId: string,
  input: Record<string, string>,
  actor: { id: string; role: RoleName },
) {
  const data = await readRentalData();
  const plan = data.tariffPlans.find((item) => item.id === tariffPlanId);
  if (!plan) {
    throw new Error("Tarifa no encontrada");
  }

  const nextTitle = (input.title ?? "").trim();
  if (!nextTitle) {
    throw new Error("Nombre de tarifa obligatorio");
  }

  plan.title = nextTitle;
  plan.season = (input.season ?? plan.season).trim();
  plan.validFrom = (input.validFrom ?? plan.validFrom).trim();
  plan.validTo = (input.validTo ?? plan.validTo).trim();
  plan.courtesyHours = Math.max(0, parseNumber(input.courtesyHours ?? String(plan.courtesyHours ?? 0)));
  plan.active = input.active === "false" ? false : true;
  plan.notes = (input.notes ?? plan.notes).trim();
  plan.updatedAt = new Date().toISOString();
  plan.updatedBy = actor.id;

  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "tariff_plan_update",
    entityId: plan.id,
    details: { code: plan.code, title: plan.title, validFrom: plan.validFrom, validTo: plan.validTo },
  });
}

export async function listTariffCatalog(tariffPlanId: string) {
  const data = await readRentalData();
  const plan = data.tariffPlans.find((item) => item.id === tariffPlanId) ?? null;
  const brackets = data.tariffBrackets
    .filter((item) => item.tariffPlanId === tariffPlanId)
    .toSorted((a, b) => a.order - b.order);
  const groups = data.vehicleCategories.map((item) => item.code || item.name).filter(Boolean);
  const prices = data.tariffPrices.filter((item) => item.tariffPlanId === tariffPlanId);
  return { plan, brackets, groups, prices };
}

export async function upsertTariffBracket(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const tariffPlanId = (input.tariffPlanId ?? "").trim();
  if (!tariffPlanId) {
    throw new Error("Tarifa obligatoria");
  }
  const plan = data.tariffPlans.find((item) => item.id === tariffPlanId);
  if (!plan) {
    throw new Error("Tarifa no encontrada");
  }
  const bracketId = (input.bracketId ?? "").trim();
  const label = (input.label ?? "").trim();
  const fromDay = parseNumber(input.fromDay ?? "0");
  const toDay = parseNumber(input.toDay ?? "0");
  const order = parseNumber(input.order ?? "0");
  if (!label || fromDay <= 0 || toDay <= 0 || fromDay > toDay) {
    throw new Error("Tramo inválido");
  }
  const now = new Date().toISOString();
  if (!bracketId) {
    data.tariffBrackets.push({
      id: crypto.randomUUID(),
      tariffPlanId,
      label,
      fromDay,
      toDay,
      order: order || data.tariffBrackets.filter((item) => item.tariffPlanId === tariffPlanId).length + 1,
      isExtraDay: input.isExtraDay === "true",
      createdAt: now,
      createdBy: actor.id,
      updatedAt: now,
      updatedBy: actor.id,
    });
  } else {
    const bracket = data.tariffBrackets.find((item) => item.id === bracketId && item.tariffPlanId === tariffPlanId);
    if (!bracket) {
      throw new Error("Tramo no encontrado");
    }
    bracket.label = label;
    bracket.fromDay = fromDay;
    bracket.toDay = toDay;
    bracket.order = order || bracket.order;
    bracket.isExtraDay = input.isExtraDay === "true";
    bracket.updatedAt = now;
    bracket.updatedBy = actor.id;
  }
  plan.updatedAt = now;
  plan.updatedBy = actor.id;
  await writeRentalData(data);
}

export async function deleteTariffBracket(bracketId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const bracket = data.tariffBrackets.find((item) => item.id === bracketId);
  if (!bracket) {
    throw new Error("Tramo no encontrado");
  }
  data.tariffBrackets = data.tariffBrackets.filter((item) => item.id !== bracketId);
  data.tariffPrices = data.tariffPrices.filter((item) => item.bracketId !== bracketId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "tariff_bracket_delete",
    entityId: bracket.id,
    details: { label: bracket.label, tariffPlanId: bracket.tariffPlanId },
  });
}

export async function upsertTariffPrice(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const tariffPlanId = (input.tariffPlanId ?? "").trim();
  const bracketId = (input.bracketId ?? "").trim();
  const groupCode = (input.groupCode ?? "").trim().toUpperCase();
  const price = parseNumber(input.price ?? "0");
  const maxKmPerDay = parseNumber(input.maxKmPerDay ?? "0");
  if (!tariffPlanId || !bracketId || !groupCode) {
    throw new Error("Tarifa, tramo y grupo son obligatorios");
  }
  const plan = data.tariffPlans.find((item) => item.id === tariffPlanId);
  if (!plan) {
    throw new Error("Tarifa no encontrada");
  }
  const bracket = data.tariffBrackets.find((item) => item.id === bracketId && item.tariffPlanId === tariffPlanId);
  if (!bracket) {
    throw new Error("Tramo no encontrado");
  }
  const existing = data.tariffPrices.find(
    (item) => item.tariffPlanId === tariffPlanId && item.bracketId === bracketId && item.groupCode === groupCode,
  );
  const now = new Date().toISOString();
  if (existing) {
    existing.price = price;
    existing.maxKmPerDay = maxKmPerDay;
    existing.updatedAt = now;
    existing.updatedBy = actor.id;
  } else {
    const row: TariffPrice = {
      id: crypto.randomUUID(),
      tariffPlanId,
      groupCode,
      bracketId,
      price,
      maxKmPerDay,
      createdAt: now,
      createdBy: actor.id,
      updatedAt: now,
      updatedBy: actor.id,
    };
    data.tariffPrices.push(row);
  }
  plan.updatedAt = now;
  plan.updatedBy = actor.id;
  await writeRentalData(data);
}

export async function deleteTariffPlan(tariffPlanId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const plan = data.tariffPlans.find((item) => item.id === tariffPlanId);
  if (!plan) {
    throw new Error("Tarifa no encontrada");
  }
  const inReservations = data.reservations.some((item) => item.appliedRate.trim() === plan.code.trim());
  const inClients = data.clients.some((item) => item.associatedRate.trim() === plan.code.trim());
  if (inReservations || inClients) {
    throw new Error("No se puede borrar tarifa usada por reservas o clientes");
  }
  data.tariffPlans = data.tariffPlans.filter((item) => item.id !== tariffPlanId);
  data.tariffBrackets = data.tariffBrackets.filter((item) => item.tariffPlanId !== tariffPlanId);
  data.tariffPrices = data.tariffPrices.filter((item) => item.tariffPlanId !== tariffPlanId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "tariff_plan_delete",
    entityId: plan.id,
    details: { code: plan.code, title: plan.title },
  });
}

export async function calculateTariffQuote(input: {
  tariffPlanId: string;
  groupCode: string;
  billedDays: number;
  deliveryAt?: string;
  pickupAt?: string;
}): Promise<{ found: boolean; amount: number; bracketLabel: string }> {
  const data = await readRentalData();
  const targetPlan = data.tariffPlans.find((item) => item.id === input.tariffPlanId);
  if (!targetPlan) {
    return { found: false, amount: 0, bracketLabel: "" };
  }
  const plansByCode = data.tariffPlans.filter((item) => item.code.toUpperCase() === targetPlan.code.toUpperCase());
  const result = calculateTariffAmountFromPlans({
    data,
    plans: plansByCode,
    groupCode: input.groupCode,
    billedDays: input.billedDays,
    deliveryAt: input.deliveryAt,
    pickupAt: input.pickupAt,
    preferredPlanId: targetPlan.id,
    courtesyHours: getGlobalCourtesyHours(data.companySettings),
  });
  return {
    found: result.found,
    amount: result.amount,
    bracketLabel: result.bracketLabel,
  };
}

// -------------------- Plantillas documentales --------------------
export async function listTemplates(query: string) {
  const data = await readRentalData();
  if (ensureReservationBaseTemplates(data)) {
    await writeRentalData(data);
  }
  const q = query.trim().toLowerCase();
  return data.templates
    .filter((item) => {
      if (!q) {
        return true;
      }
      return [item.templateCode, item.templateType, item.language, item.title].join(" ").toLowerCase().includes(q);
    })
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createTemplate(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const templateTypeRaw = (input.templateType ?? "CONTRATO").toUpperCase();
  const templateType = (["CONTRATO", "CONFIRMACION_RESERVA", "PRESUPUESTO", "FACTURA"] as const).includes(
    templateTypeRaw as "CONTRATO" | "CONFIRMACION_RESERVA" | "PRESUPUESTO" | "FACTURA",
  )
    ? (templateTypeRaw as "CONTRATO" | "CONFIRMACION_RESERVA" | "PRESUPUESTO" | "FACTURA")
    : "CONTRATO";
  const templateCode = (input.templateCode ?? "").trim().toUpperCase();
  const language = (input.language ?? "").trim().toLowerCase();
  const title = (input.title ?? "").trim();
  const htmlContent = (input.htmlContent ?? "").trim();

  if (!templateCode || !language || !title || !htmlContent) {
    throw new Error("Faltan campos obligatorios de plantilla");
  }

  const exists = data.templates.find((item) => item.templateCode === templateCode && item.language === language);
  if (exists) {
    throw new Error("Ya existe plantilla con mismo código e idioma");
  }

  const template = {
    id: crypto.randomUUID(),
    templateCode,
    templateType,
    language,
    title,
    htmlContent,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  data.templates.push(template);
  await writeRentalData(data);
}

export async function updateTemplate(input: Record<string, string>, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const templateId = (input.templateId ?? "").trim();
  const template = data.templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Plantilla no encontrada");
  }

  template.title = (input.title ?? template.title).trim();
  template.language = (input.language ?? template.language).trim().toLowerCase() || template.language;
  template.htmlContent = (input.htmlContent ?? template.htmlContent).trim() || template.htmlContent;
  template.active = input.active === "false" ? false : true;
  template.updatedAt = new Date().toISOString();
  template.updatedBy = actor.id;

  await writeRentalData(data);
}

export async function deleteTemplate(templateId: string, actor: { id: string; role: RoleName }) {
  const data = await readRentalData();
  const template = data.templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Plantilla no encontrada");
  }
  data.templates = data.templates.filter((item) => item.id !== templateId);
  await writeRentalData(data);
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "template_delete",
    entityId: template.id,
    details: { templateCode: template.templateCode, language: template.language },
  });
}

// Helpers internos para transformar datos de listados y parsing de importes.
function mapListRow(reservation: Reservation, contract: Contract | null, mode: "DELIVERY" | "PICKUP"): DeliveryPickupListRow {
  const start = parseDateSafe(reservation.deliveryAt);
  const end = parseDateSafe(reservation.pickupAt);
  const dayMs = 1000 * 60 * 60 * 24;
  const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs)) : 0;
  return {
    reservationId: reservation.id,
    reservationNumber: reservation.reservationNumber,
    hasContract: Boolean(contract),
    contractNumber: contract?.contractNumber ?? "",
    stateLabel: contract ? "CONTRATADA" : reservation.reservationStatus,
    customerName: reservation.customerName,
    place: mode === "DELIVERY" ? reservation.deliveryPlace : reservation.pickupPlace,
    branch: mode === "DELIVERY" ? reservation.branchDelivery : reservation.pickupBranch,
    datetime: mode === "DELIVERY" ? reservation.deliveryAt : reservation.pickupAt,
    datetimeRaw: mode === "DELIVERY" ? reservation.deliveryAt : reservation.pickupAt,
    vehiclePlate: reservation.assignedPlate,
    totalPrice: reservation.totalPrice,
    days,
    privateNotes: reservation.privateNotes,
  };
}

function splitAmountEqually(totalAmount: number, buckets: number): number[] {
  if (buckets <= 0) {
    return [];
  }
  const cents = Math.round(totalAmount * 100);
  const base = Math.trunc(cents / buckets);
  const remainder = cents - base * buckets;
  const result: number[] = [];
  for (let index = 0; index < buckets; index += 1) {
    result.push((base + (index < remainder ? 1 : 0)) / 100);
  }
  return result;
}

function parseDailyExpenseMeta(note: string): { batchId: string; workerName: string } {
  const batchMatch = note.match(/\[BATCH:([^\]]+)\]/i);
  const workerMatch = note.match(/empleado=([^;]+)/i);
  return {
    batchId: batchMatch?.[1]?.trim() || "",
    workerName: workerMatch?.[1]?.trim() || "",
  };
}

function normalizeCsvHeader(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === delimiter && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function parseCsvRecords(csvRaw: string): Array<Record<string, string>> {
  const text = csvRaw.replace(/\r/g, "").trim();
  if (!text) return [];
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";
  const headers = parseCsvLine(headerLine, delimiter).map((item) => normalizeCsvHeader(item));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      row[header] = (cells[idx] ?? "").trim();
    });
    const hasAnyData = Object.values(row).some((value) => value !== "");
    if (hasAnyData) rows.push(row);
  }
  return rows;
}

function getRowValue(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalized = normalizeCsvHeader(key);
    const value = row[normalized];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

export async function importClientsFromCsv(csvRaw: string, actor: { id: string; role: RoleName }) {
  const rows = parseCsvRecords(csvRaw);
  if (rows.length === 0) {
    return { rows: 0, created: 0, reused: 0 };
  }

  const existing = await readRentalData();
  const seenDocument = new Set(existing.clients.map((item) => item.documentNumber.trim().toLowerCase()).filter(Boolean));
  const seenLicense = new Set(existing.clients.map((item) => item.licenseNumber.trim().toLowerCase()).filter(Boolean));
  let created = 0;
  let reused = 0;

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const sourceDoc = getRowValue(row, ["documentNumber", "dni", "documento", "doc"]);
    const sourceLicense = getRowValue(row, ["licenseNumber", "permiso", "permisoConducir", "permiso_conducir", "carnet", "licencia", "driverLicense", "drivingLicense"]);
    const docKey = sourceDoc.toLowerCase();
    const licenseKey = sourceLicense.toLowerCase();
    const alreadyKnown = Boolean((docKey && seenDocument.has(docKey)) || (licenseKey && seenLicense.has(licenseKey)));

    const companyName = getRowValue(row, ["companyName", "empresa", "razonSocial", "razon_social", "nombreEmpresa"]);
    const clientTypeRaw = getRowValue(row, ["clientType", "tipo", "tipoCliente", "tipo_cliente"]).toUpperCase();
    const clientType =
      (["PARTICULAR", "EMPRESA", "COMISIONISTA"] as const).includes(
        clientTypeRaw as "PARTICULAR" | "EMPRESA" | "COMISIONISTA",
      )
        ? (clientTypeRaw as "PARTICULAR" | "EMPRESA" | "COMISIONISTA")
        : companyName
          ? "EMPRESA"
          : "PARTICULAR";

    const importId = String(idx + 1);
    const firstName = getRowValue(row, ["firstName", "nombre", "nombreCliente", "nombre_cliente"]) || "N/D";
    const lastName = getRowValue(row, ["lastName", "apellidos", "apellido"]) || "N/D";
    const email = getRowValue(row, ["email", "correo", "mail"]) || `cliente${importId}@import.local`;
    const documentNumber = sourceDoc || `DOC-IMPORT-${importId}`;
    const licenseNumber = sourceLicense || `LIC-IMPORT-${importId}`;
    const residenceStreet = getRowValue(row, ["residenceStreet", "direccion", "direccionResidencia"]) || "N/D";
    const residenceCity = getRowValue(row, ["residenceCity", "ciudad", "municipio"]) || "N/D";
    const residenceCountry = getRowValue(row, ["residenceCountry", "pais"]) || "ES";
    const vacationStreet = getRowValue(row, ["vacationStreet", "direccionVacaciones"]) || residenceStreet;
    const vacationCity = getRowValue(row, ["vacationCity", "ciudadVacaciones"]) || residenceCity;
    const vacationCountry = getRowValue(row, ["vacationCountry", "paisVacaciones"]) || residenceCountry;
    const companyTaxId = getRowValue(row, ["taxId", "cif", "nif", "vat"]) || `TAX-IMPORT-${importId}`;
    const fiscalAddress = getRowValue(row, ["fiscalAddress", "direccionFiscal"]) || "N/D";

    await createClient(
      {
        allowDuplicateLoad: "true",
        clientType,
        firstName,
        lastName,
        companyName: companyName || `${firstName} ${lastName}`.trim(),
        nationality: getRowValue(row, ["nationality", "nacionalidad"]) || "ES",
        language: getRowValue(row, ["language", "idioma"]) || "es",
        documentType: getRowValue(row, ["documentType", "tipoDocumento"]) || "DNI",
        documentNumber,
        licenseNumber,
        email,
        phone1: getRowValue(row, ["phone1", "telefono", "movil"]) || "000000000",
        birthDate: getRowValue(row, ["birthDate", "fechaNacimiento"]) || "1970-01-01",
        birthPlace: getRowValue(row, ["birthPlace", "lugarNacimiento"]) || "N/D",
        residenceStreet,
        residenceCity,
        residenceCountry,
        vacationStreet,
        vacationCity,
        vacationCountry,
        taxId: companyTaxId,
        fiscalAddress,
      },
      actor,
    );

    if (alreadyKnown) {
      reused += 1;
    } else {
      created += 1;
      if (docKey) seenDocument.add(docKey);
      if (licenseKey) seenLicense.add(licenseKey);
    }
  }

  return { rows: rows.length, created, reused };
}

export async function importTariffCatalogFromCsv(csvRaw: string, actor: { id: string; role: RoleName }) {
  const rows = parseCsvRecords(csvRaw);
  if (rows.length === 0) {
    return {
      rows: 0,
      plansCreated: 0,
      plansUpdated: 0,
      bracketsCreated: 0,
      bracketsUpdated: 0,
      pricesCreated: 0,
      pricesUpdated: 0,
    };
  }

  const data = await readRentalData();
  const now = new Date().toISOString();
  let plansCreated = 0;
  let bracketsCreated = 0;
  let pricesCreated = 0;
  const touchedPlans = new Set<string>();
  const touchedBrackets = new Set<string>();
  const touchedPrices = new Set<string>();

  for (const row of rows) {
    const code = (getRowValue(row, ["tariffCode", "planCode", "codigoTarifa", "codigo"]) || "").toUpperCase();
    const title = getRowValue(row, ["tariffTitle", "planTitle", "nombreTarifa", "titulo"]);
    if (!code || !title) continue;

    let plan = data.tariffPlans.find((item) => item.code === code);
    if (!plan) {
      plan = {
        id: crypto.randomUUID(),
        code,
        title,
        season: getRowValue(row, ["season", "temporada"]),
        validFrom: getRowValue(row, ["validFrom", "desde"]),
        validTo: getRowValue(row, ["validTo", "hasta"]),
        courtesyHours: Math.max(0, parseNumber(getRowValue(row, ["courtesyHours", "horasCortesia", "cortesiaHoras"]) || "0")),
        priceMode:
          getRowValue(row, ["priceMode", "modoPrecio"]) === "PRECIO_B"
            ? "PRECIO_B"
            : getRowValue(row, ["priceMode", "modoPrecio"]) === "PRECIO_C"
              ? "PRECIO_C"
              : "PRECIO_A",
        active: getRowValue(row, ["active", "activa"]) === "false" ? false : true,
        notes: getRowValue(row, ["notes", "notas"]),
        createdAt: now,
        createdBy: actor.id,
        updatedAt: now,
        updatedBy: actor.id,
      };
      data.tariffPlans.push(plan);
      plansCreated += 1;
    } else {
      if (!touchedPlans.has(plan.id)) {
        touchedPlans.add(plan.id);
      }
      plan.title = title || plan.title;
      plan.season = getRowValue(row, ["season", "temporada"]) || plan.season;
      plan.validFrom = getRowValue(row, ["validFrom", "desde"]) || plan.validFrom;
      plan.validTo = getRowValue(row, ["validTo", "hasta"]) || plan.validTo;
      plan.courtesyHours = Math.max(
        0,
        parseNumber(getRowValue(row, ["courtesyHours", "horasCortesia", "cortesiaHoras"]) || String(plan.courtesyHours || 0)),
      );
      plan.updatedAt = now;
      plan.updatedBy = actor.id;
    }

    const bracketLabel = getRowValue(row, ["bracketLabel", "tramo", "label"]);
    const fromDay = parseNumber(getRowValue(row, ["fromDay", "desdeDia", "diaDesde"]) || "0");
    const toDay = parseNumber(getRowValue(row, ["toDay", "hastaDia", "diaHasta"]) || "0");
    if (!bracketLabel || fromDay <= 0 || toDay <= 0) continue;

    let bracket = data.tariffBrackets.find(
      (item) => item.tariffPlanId === plan.id && item.label === bracketLabel && item.fromDay === fromDay && item.toDay === toDay,
    );
    if (!bracket) {
      const order = parseNumber(getRowValue(row, ["order", "orden"]) || "0");
      bracket = {
        id: crypto.randomUUID(),
        tariffPlanId: plan.id,
        label: bracketLabel,
        fromDay,
        toDay,
        order: order || data.tariffBrackets.filter((item) => item.tariffPlanId === plan.id).length + 1,
        isExtraDay: getRowValue(row, ["isExtraDay", "diaExtra"]) === "true",
        createdAt: now,
        createdBy: actor.id,
        updatedAt: now,
        updatedBy: actor.id,
      };
      data.tariffBrackets.push(bracket);
      bracketsCreated += 1;
    } else if (!touchedBrackets.has(bracket.id)) {
      touchedBrackets.add(bracket.id);
      bracket.order = parseNumber(getRowValue(row, ["order", "orden"]) || String(bracket.order)) || bracket.order;
      bracket.isExtraDay = getRowValue(row, ["isExtraDay", "diaExtra"]) === "true";
      bracket.updatedAt = now;
      bracket.updatedBy = actor.id;
    }

    const groupCode = getRowValue(row, ["groupCode", "grupo", "categoria"]).toUpperCase();
    const priceRaw = getRowValue(row, ["price", "importe", "precio"]);
    if (!groupCode || !priceRaw) continue;
    const price = parseNumber(priceRaw);
    const maxKmPerDay = parseNumber(getRowValue(row, ["maxKmPerDay", "kmDiaMax", "kmMax"]) || "0");
    const priceExisting = data.tariffPrices.find(
      (item) => item.tariffPlanId === plan.id && item.bracketId === bracket.id && item.groupCode === groupCode,
    );
    if (!priceExisting) {
      const newPrice: TariffPrice = {
        id: crypto.randomUUID(),
        tariffPlanId: plan.id,
        groupCode,
        bracketId: bracket.id,
        price,
        maxKmPerDay,
        createdAt: now,
        createdBy: actor.id,
        updatedAt: now,
        updatedBy: actor.id,
      };
      data.tariffPrices.push(newPrice);
      pricesCreated += 1;
    } else {
      touchedPrices.add(priceExisting.id);
      priceExisting.price = price;
      priceExisting.maxKmPerDay = maxKmPerDay;
      priceExisting.updatedAt = now;
      priceExisting.updatedBy = actor.id;
    }
  }

  await writeRentalData(data);
  return {
    rows: rows.length,
    plansCreated,
    plansUpdated: touchedPlans.size,
    bracketsCreated,
    bracketsUpdated: touchedBrackets.size,
    pricesCreated,
    pricesUpdated: touchedPrices.size,
  };
}

export async function importVehiclesFromCsv(csvRaw: string, actor: { id: string; role: RoleName }) {
  const rows = parseCsvRecords(csvRaw);
  if (rows.length === 0) {
    return {
      rows: 0,
      categoriesCreated: 0,
      categoriesUpdated: 0,
      modelsCreated: 0,
      modelsUpdated: 0,
      fleetCreated: 0,
      fleetUpdated: 0,
    };
  }

  const data = await readRentalData();
  const now = new Date().toISOString();
  let categoriesCreated = 0;
  let modelsCreated = 0;
  let fleetCreated = 0;
  const touchedCategoryIds = new Set<string>();
  const touchedModelIds = new Set<string>();
  const touchedFleetIds = new Set<string>();

  for (const row of rows) {
    const categoryCode = (getRowValue(row, ["categoryCode", "groupCode", "grupo", "categoria"]) || "").toUpperCase();
    const categoryName = getRowValue(row, ["categoryName", "groupName", "nombreCategoria", "categoriaNombre"]);
    const brand = getRowValue(row, ["brand", "marca"]);
    const modelName = getRowValue(row, ["model", "modelo"]);
    const plate = (getRowValue(row, ["plate", "matricula"]) || "").toUpperCase();
    if (!brand || !modelName || !plate) continue;

    let category =
      data.vehicleCategories.find((item) => item.code === categoryCode) ??
      data.vehicleCategories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase());

    if (!category) {
      category = {
        id: crypto.randomUUID(),
        code: categoryCode || categoryName.toUpperCase().replace(/\s+/g, "-") || "GRP-IMPORT",
        name: categoryName || categoryCode || "Categoría importada",
        summary: getRowValue(row, ["categorySummary", "resumen"]),
        transmissionRequired: getRowValue(row, ["transmissionRequired", "transmision"]) === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL",
        minSeats: parseNumber(getRowValue(row, ["minSeats", "plazas"]) || "0"),
        minDoors: parseNumber(getRowValue(row, ["minDoors", "puertas"]) || "0"),
        minLuggage: parseNumber(getRowValue(row, ["minLuggage", "maletas"]) || "0"),
        fuelType: getRowValue(row, ["fuelType", "combustible"]),
        airConditioning: getRowValue(row, ["airConditioning", "aire"]) === "true",
        insurancePrice: parseNumber(getRowValue(row, ["insurancePrice", "precioSeguro"]) || "0"),
        deductiblePrice: parseNumber(getRowValue(row, ["deductiblePrice", "precioFranquicia"]) || "0"),
        depositPrice: parseNumber(getRowValue(row, ["depositPrice", "precioFianza"]) || "0"),
        createdAt: now,
        createdBy: actor.id,
      };
      data.vehicleCategories.push(category);
      categoriesCreated += 1;
    } else {
      touchedCategoryIds.add(category.id);
      category.name = categoryName || category.name;
      category.summary = getRowValue(row, ["categorySummary", "resumen"]) || category.summary;
      category.fuelType = getRowValue(row, ["fuelType", "combustible"]) || category.fuelType;
    }

    let model = data.vehicleModels.find(
      (item) => item.brand.toLowerCase() === brand.toLowerCase() && item.model.toLowerCase() === modelName.toLowerCase(),
    );
    if (!model) {
      model = {
        id: crypto.randomUUID(),
        brand,
        model: modelName,
        transmission: getRowValue(row, ["transmission", "transmision"]) === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL",
        features: getRowValue(row, ["features", "caracteristicas"]),
        fuelType: getRowValue(row, ["fuelType", "combustible"]) || category.fuelType,
        categoryId: category.id,
        createdAt: now,
        createdBy: actor.id,
      };
      data.vehicleModels.push(model);
      modelsCreated += 1;
    } else {
      touchedModelIds.add(model.id);
      model.categoryId = category.id || model.categoryId;
      model.transmission = getRowValue(row, ["transmission", "transmision"]) === "AUTOMATICO" ? "AUTOMATICO" : model.transmission;
      model.fuelType = getRowValue(row, ["fuelType", "combustible"]) || model.fuelType;
    }

    const existingFleet = data.fleetVehicles.find((item) => item.plate.toUpperCase() === plate);
    if (!existingFleet) {
      data.fleetVehicles.push({
        id: crypto.randomUUID(),
        plate,
        modelId: model.id,
        categoryId: category.id,
        owner: normalizeOwnerName(getRowValue(row, ["owner", "propietario"])),
        color: getRowValue(row, ["color"]),
        year: parseNumber(getRowValue(row, ["year", "anio"]) || "0"),
        vin: getRowValue(row, ["vin", "bastidor"]),
        odometerKm: parseNumber(getRowValue(row, ["odometerKm", "odometro", "km"]) || "0"),
        fuelType: getRowValue(row, ["fuelType", "combustible"]) || model.fuelType,
        activeFrom: getRowValue(row, ["activeFrom", "fechaAlta"]) || now.slice(0, 10),
        activeUntil: getRowValue(row, ["activeUntil", "fechaBaja"]),
        acquisitionCost: parseNumber(getRowValue(row, ["acquisitionCost", "costeAdquisicion"]) || "0"),
        alertNotes: getRowValue(row, ["alertNotes", "notasAlerta"]),
        deactivatedAt: "",
        deactivationReason: "",
        deactivationAmount: 0,
        createdAt: now,
        createdBy: actor.id,
      });
      fleetCreated += 1;
    } else {
      touchedFleetIds.add(existingFleet.id);
      existingFleet.modelId = model.id;
      existingFleet.categoryId = category.id;
      existingFleet.owner = normalizeOwnerName(getRowValue(row, ["owner", "propietario"]) || existingFleet.owner);
      existingFleet.color = getRowValue(row, ["color"]) || existingFleet.color;
      existingFleet.year = parseNumber(getRowValue(row, ["year", "anio"]) || String(existingFleet.year));
      existingFleet.vin = getRowValue(row, ["vin", "bastidor"]) || existingFleet.vin;
      existingFleet.odometerKm = parseNumber(
        getRowValue(row, ["odometerKm", "odometro", "km"]) || String(existingFleet.odometerKm),
      );
      existingFleet.fuelType = getRowValue(row, ["fuelType", "combustible"]) || existingFleet.fuelType;
      existingFleet.activeFrom = getRowValue(row, ["activeFrom", "fechaAlta"]) || existingFleet.activeFrom;
      existingFleet.activeUntil = getRowValue(row, ["activeUntil", "fechaBaja"]) || existingFleet.activeUntil;
      existingFleet.acquisitionCost = parseNumber(
        getRowValue(row, ["acquisitionCost", "costeAdquisicion"]) || String(existingFleet.acquisitionCost),
      );
      existingFleet.alertNotes = getRowValue(row, ["alertNotes", "notasAlerta"]) || existingFleet.alertNotes;
    }
  }

  await writeRentalData(data);
  return {
    rows: rows.length,
    categoriesCreated,
    categoriesUpdated: touchedCategoryIds.size,
    modelsCreated,
    modelsUpdated: touchedModelIds.size,
    fleetCreated,
    fleetUpdated: touchedFleetIds.size,
  };
}
