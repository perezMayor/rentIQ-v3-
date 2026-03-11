"use client";

import { useMemo, useState } from "react";

const SPECIAL_RATE_CODE_SEASON_CROSS = "TXT";
const SPECIAL_RATE_CODE_MANUAL = "MAN";

type ClientLite = {
  id: string;
  clientCode: string;
  clientType: "PARTICULAR" | "EMPRESA" | "COMISIONISTA";
  firstName: string;
  lastName: string;
  companyName: string;
  commissionerName: string;
  documentNumber: string;
  licenseNumber: string;
  email: string;
  phone1: string;
  acquisitionChannel: string;
};

type ExtraOption = {
  id: string;
  code: string;
  name: string;
  priceMode: "FIJO" | "POR_DIA";
  unitPrice: number;
  maxDays: number;
};

type TariffCatalog = {
  plan: { id: string; code: string; validFrom: string; validTo: string; updatedAt: string };
  brackets: Array<{ id: string; fromDay: number; toDay: number; order: number; label: string }>;
  prices: Array<{ bracketId: string; groupCode: string; price: number }>;
};

type Props = {
  action: (formData: FormData) => void;
  canWrite: boolean;
  clients: ClientLite[];
  vehicles: Array<{ plate: string; groupLabel: string; activeUntil: string }>;
  reservations: Array<{ assignedPlate: string; deliveryAt: string; pickupAt: string }>;
  contracts: Array<{ vehiclePlate: string; deliveryAt: string; pickupAt: string }>;
  tariffOptions: Array<{ id: string; code: string; title: string }>;
  tariffCatalogs: TariffCatalog[];
  salesChannels: string[];
  branches: Array<{ code: string; name: string }>;
  defaultBranchCode?: string;
  courtesyHours: number;
  allGroups: string[];
  insuranceOptions?: ExtraOption[];
  extraOptions: ExtraOption[];
  initialValues?: {
    lookup?: string;
    customerId?: string;
    customerName?: string;
    customerCompany?: string;
    customerCommissioner?: string;
    branchDelivery?: string;
    deliveryPlace?: string;
    deliveryAt?: string;
    pickupBranch?: string;
    pickupPlace?: string;
    pickupAt?: string;
    billedCarGroup?: string;
    assignedVehicleGroup?: string;
    assignedPlate?: string;
    appliedRate?: string;
    salesChannel?: string;
    totalPrice?: string;
    billedDays?: string;
    ivaPercent?: string;
    deductible?: string;
    depositAmount?: string;
    paymentsMade?: string;
    baseAmount?: string;
    discountAmount?: string;
    discountBreakdown?: string;
    extrasAmount?: string;
    fuelAmount?: string;
    insuranceAmount?: string;
    penaltiesAmount?: string;
    extrasBreakdown?: string;
    additionalDrivers?: string;
    publicNotes?: string;
    privateNotes?: string;
  };
};

function parseNumberInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clientDisplayName(client: ClientLite): string {
  const personal = `${client.firstName} ${client.lastName}`.trim();
  if (personal) return personal;
  if (client.companyName) return client.companyName;
  if (client.commissionerName) return client.commissionerName;
  return client.clientCode;
}

function parseDateSafe(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a1 = parseDateSafe(aStart);
  const a2 = parseDateSafe(aEnd);
  const b1 = parseDateSafe(bStart);
  const b2 = parseDateSafe(bEnd);
  if (!a1 || !a2 || !b1 || !b2) return false;
  return a1 < b2 && b1 < a2;
}

function computeBilledDaysBy24h(deliveryAt: string, pickupAt: string, courtesyHours = 0): number {
  const delivery = parseDateSafe(deliveryAt);
  const pickup = parseDateSafe(pickupAt);
  if (!delivery || !pickup) return 1;
  const diffMs = pickup.getTime() - delivery.getTime();
  if (diffMs <= 0) return 1;
  const dayMs = 24 * 60 * 60 * 1000;
  const fullDays = Math.floor(diffMs / dayMs);
  const remainder = diffMs - fullDays * dayMs;
  if (remainder <= 0) return Math.max(1, fullDays);
  const courtesyMs = Math.max(0, courtesyHours) * 60 * 60 * 1000;
  return Math.max(1, remainder > courtesyMs ? fullDays + 1 : fullDays);
}

function dateOnlyToDayNumber(value: string): number | null {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = parseDateSafe(`${raw}T00:00:00`);
  if (!parsed) return null;
  return Math.floor(parsed.getTime() / (24 * 60 * 60 * 1000));
}

function toDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveTariffAmountForPlanDays(input: {
  brackets: Array<{ id: string; fromDay: number; toDay: number; order: number; label: string }>;
  prices: Array<{ bracketId: string; groupCode: string; price: number }>;
  groupCode: string;
  targetDays: number;
}): { found: boolean; amount: number } {
  const days = Math.max(1, Math.floor(input.targetDays));
  const groupCode = input.groupCode.trim().toUpperCase();
  const brackets = [...input.brackets].sort((a, b) => a.order - b.order);
  const exact = brackets.find((item) => days >= item.fromDay && days <= item.toDay);
  if (exact) {
    const priceRow = input.prices.find((item) => item.bracketId === exact.id && item.groupCode.trim().toUpperCase() === groupCode);
    if (priceRow) {
      return { found: true, amount: Number(priceRow.price.toFixed(2)) };
    }
  }
  const lower = [...brackets].filter((item) => item.toDay < days).sort((a, b) => b.toDay - a.toDay)[0];
  if (!lower) return { found: false, amount: 0 };
  const lowerPrice = input.prices.find((item) => item.bracketId === lower.id && item.groupCode.trim().toUpperCase() === groupCode);
  if (!lowerPrice || lower.toDay <= 0) return { found: false, amount: 0 };
  const perDay = lowerPrice.price / lower.toDay;
  return { found: true, amount: Number((perDay * days).toFixed(2)) };
}

function selectTariffPlanForDate(plans: TariffCatalog[], dateKey: string, fallbackPlanId: string) {
  const dayNumber = dateOnlyToDayNumber(dateKey);
  if (dayNumber === null) {
    return plans.find((item) => item.plan.id === fallbackPlanId) ?? plans[0] ?? null;
  }
  const matching = plans.filter((item) => {
    const from = dateOnlyToDayNumber(item.plan.validFrom);
    const to = dateOnlyToDayNumber(item.plan.validTo);
    if (from !== null && dayNumber < from) return false;
    if (to !== null && dayNumber > to) return false;
    return true;
  });
  if (matching.length > 0) {
    return [...matching].sort((a, b) => {
      const aFrom = dateOnlyToDayNumber(a.plan.validFrom) ?? Number.MIN_SAFE_INTEGER;
      const bFrom = dateOnlyToDayNumber(b.plan.validFrom) ?? Number.MIN_SAFE_INTEGER;
      return aFrom - bFrom;
    })[0];
  }
  return plans.find((item) => item.plan.id === fallbackPlanId) ?? plans[0] ?? null;
}

function resolveAutoRateCodeForDate(plans: TariffCatalog[], dateTime: string): string {
  const target = parseDateSafe(dateTime);
  if (!target) return "";
  const dayNumber = dateOnlyToDayNumber(toDateKeyLocal(target));
  if (dayNumber === null) return "";
  const matching = plans.filter((item) => {
    const from = dateOnlyToDayNumber(item.plan.validFrom);
    const to = dateOnlyToDayNumber(item.plan.validTo);
    if (from !== null && dayNumber < from) return false;
    if (to !== null && dayNumber > to) return false;
    return true;
  });
  if (matching.length === 0) return "";
  return matching
    .toSorted((a, b) => {
      const aFrom = dateOnlyToDayNumber(a.plan.validFrom) ?? Number.MIN_SAFE_INTEGER;
      const bFrom = dateOnlyToDayNumber(b.plan.validFrom) ?? Number.MIN_SAFE_INTEGER;
      if (aFrom !== bFrom) return aFrom - bFrom;
      return b.plan.updatedAt.localeCompare(a.plan.updatedAt);
    })[0]?.plan.code ?? "";
}

function isRateCodeActiveForDate(plans: TariffCatalog[], rateCode: string, dateTime: string): boolean {
  const normalizedCode = rateCode.trim().toUpperCase();
  if (!normalizedCode) return false;
  const target = parseDateSafe(dateTime);
  if (!target) return false;
  const dayNumber = dateOnlyToDayNumber(toDateKeyLocal(target));
  if (dayNumber === null) return false;
  return plans.some((item) => {
    if (item.plan.code.trim().toUpperCase() !== normalizedCode) return false;
    const from = dateOnlyToDayNumber(item.plan.validFrom);
    const to = dateOnlyToDayNumber(item.plan.validTo);
    if (from !== null && dayNumber < from) return false;
    if (to !== null && dayNumber > to) return false;
    return true;
  });
}

function calculateTariffAmountFromPlans(input: {
  plans: TariffCatalog[];
  groupCode: string;
  billedDays: number;
  deliveryAt: string;
  pickupAt: string;
}): { found: boolean; amount: number; isSeasonSplit: boolean } {
  const days = Math.max(1, Math.floor(input.billedDays));
  if (input.plans.length === 0) return { found: false, amount: 0, isSeasonSplit: false };
  const fallbackPlan = [...input.plans].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt))[0];
  const start = parseDateSafe(input.deliveryAt);
  const end = parseDateSafe(input.pickupAt);
  const canSplitBySeason = Boolean(start && end && end.getTime() > start.getTime() && days > 1);
  if (!fallbackPlan) return { found: false, amount: 0, isSeasonSplit: false };

  if (!canSplitBySeason) {
    const base = resolveTariffAmountForPlanDays({
      brackets: fallbackPlan.brackets,
      prices: fallbackPlan.prices,
      groupCode: input.groupCode,
      targetDays: days,
    });
    return { found: base.found, amount: base.amount, isSeasonSplit: false };
  }

  const countedDays = computeBilledDaysBy24h(input.deliveryAt, input.pickupAt);
  const blocks = Math.max(days, countedDays);
  const planDays = new Map<string, number>();
  const ms24h = 24 * 60 * 60 * 1000;
  for (let i = 0; i < blocks; i += 1) {
    const dateKey = toDateKeyLocal(new Date(start!.getTime() + i * ms24h));
    const planForDate = selectTariffPlanForDate(input.plans, dateKey, fallbackPlan.plan.id);
    if (!planForDate) continue;
    planDays.set(planForDate.plan.id, (planDays.get(planForDate.plan.id) ?? 0) + 1);
  }
  if (planDays.size <= 1) {
    const onlyPlanId = planDays.keys().next().value as string | undefined;
    const plan = input.plans.find((item) => item.plan.id === onlyPlanId) ?? fallbackPlan;
      const base = resolveTariffAmountForPlanDays({
        brackets: plan.brackets,
        prices: plan.prices,
        groupCode: input.groupCode,
        targetDays: blocks,
      });
      return { found: base.found, amount: base.amount, isSeasonSplit: false };
  }

  const referenceDays = blocks < 7 ? 3 : 7;
  let total = 0;
  for (const [planId, segmentDays] of planDays.entries()) {
    const plan = input.plans.find((item) => item.plan.id === planId);
    if (!plan) return { found: false, amount: 0, isSeasonSplit: false };
    const base = resolveTariffAmountForPlanDays({
      brackets: plan.brackets,
      prices: plan.prices,
      groupCode: input.groupCode,
      targetDays: referenceDays,
    });
    if (!base.found || referenceDays <= 0) return { found: false, amount: 0, isSeasonSplit: false };
    total += Number(((base.amount / referenceDays) * segmentDays).toFixed(2));
  }
  return { found: true, amount: Number(total.toFixed(2)), isSeasonSplit: true };
}

function getAvailablePlatesForGroup(input: {
  requestedGroup: string;
  deliveryAt: string;
  pickupAt: string;
  vehicles: Props["vehicles"];
  reservations: Props["reservations"];
  contracts: Props["contracts"];
}) {
  const requestedGroup = input.requestedGroup.trim().toUpperCase();
  if (!requestedGroup || !input.deliveryAt || !input.pickupAt) return [];
  return input.vehicles
    .filter((vehicle) => vehicle.groupLabel.trim().toUpperCase() === requestedGroup)
    .filter((vehicle) => {
      if (vehicle.activeUntil) {
        const limit = parseDateSafe(`${vehicle.activeUntil}T23:59:59`);
        const start = parseDateSafe(input.deliveryAt);
        if (limit && start && start > limit) return false;
      }
      const conflictsReservation = input.reservations.some(
        (item) =>
          item.assignedPlate.trim().toUpperCase() === vehicle.plate.trim().toUpperCase() &&
          hasOverlap(item.deliveryAt, item.pickupAt, input.deliveryAt, input.pickupAt),
      );
      if (conflictsReservation) return false;
      return !input.contracts.some(
        (item) =>
          item.vehiclePlate.trim().toUpperCase() === vehicle.plate.trim().toUpperCase() &&
          hasOverlap(item.deliveryAt, item.pickupAt, input.deliveryAt, input.pickupAt),
      );
    })
    .map((vehicle) => vehicle.plate)
    .sort((a, b) => a.localeCompare(b));
}

function parseAdditionalDrivers(value: string): { name: string; license: string } {
  const normalized = value.trim();
  if (!normalized) return { name: "", license: "" };
  const nameMatch = normalized.match(/Nombre:\s*([^|]+)/i);
  const licenseMatch = normalized.match(/(?:Carnet|Permiso):\s*(.+)$/i);
  return {
    name: (nameMatch?.[1] ?? "").trim(),
    license: (licenseMatch?.[1] ?? "").trim(),
  };
}

function parseDiscountBreakdown(value: string): Array<{ percent: number; amount: number }> {
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as { percent?: unknown; amount?: unknown };
        const percent = Number(candidate.percent ?? 0);
        const amount = Number(candidate.amount ?? 0);
        if (!Number.isFinite(percent) || percent <= 0) return null;
        return {
          percent: Number(percent.toFixed(2)),
          amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0,
        };
      })
      .filter((item): item is { percent: number; amount: number } => item !== null);
  } catch {
    return [];
  }
}

export function ContractCreateForm({
  action,
  canWrite,
  clients,
  vehicles,
  reservations,
  contracts,
  tariffOptions,
  tariffCatalogs,
  salesChannels,
  branches,
  defaultBranchCode,
  courtesyHours: globalCourtesyHours,
  allGroups,
  insuranceOptions = [],
  extraOptions,
  initialValues,
}: Props) {
  void insuranceOptions;
  const [activeBottomTab, setActiveBottomTab] = useState<"notas-publicas" | "notas-privadas" | "extras" | "conductores">(
    "notas-publicas",
  );
  const parsedAdditionalDrivers = parseAdditionalDrivers(String(initialValues?.additionalDrivers ?? ""));
  const [clientLookup, setClientLookup] = useState(String(initialValues?.lookup ?? ""));
  const [customerId, setCustomerId] = useState(String(initialValues?.customerId ?? ""));
  const [customerName, setCustomerName] = useState(String(initialValues?.customerName ?? ""));
  const [customerCompany, setCustomerCompany] = useState(String(initialValues?.customerCompany ?? ""));
  const [customerCommissioner, setCustomerCommissioner] = useState(String(initialValues?.customerCommissioner ?? ""));
  const [salesChannel, setSalesChannel] = useState(String(initialValues?.salesChannel ?? ""));
  const initialBranchCode =
    defaultBranchCode && branches.some((branch) => branch.code === defaultBranchCode) ? defaultBranchCode : (branches[0]?.code ?? "");
  const [branchDelivery, setBranchDelivery] = useState(String(initialValues?.branchDelivery ?? initialBranchCode));
  const [pickupBranch, setPickupBranch] = useState(String(initialValues?.pickupBranch ?? initialValues?.branchDelivery ?? initialBranchCode));
  const [deliveryAt, setDeliveryAt] = useState(String(initialValues?.deliveryAt ?? ""));
  const [pickupAt, setPickupAt] = useState(String(initialValues?.pickupAt ?? ""));
  const [appliedRate, setAppliedRate] = useState(String(initialValues?.appliedRate ?? ""));
  const [billedCarGroup, setBilledCarGroup] = useState(String(initialValues?.billedCarGroup ?? ""));
  const [assignedPlate, setAssignedPlate] = useState(String(initialValues?.assignedPlate ?? ""));
  const [assignedVehicleGroup, setAssignedVehicleGroup] = useState(String(initialValues?.assignedVehicleGroup ?? ""));
  const [priceLocked, setPriceLocked] = useState(false);
  const [autoPriceEnabled, setAutoPriceEnabled] = useState(true);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityGroup, setAvailabilityGroup] = useState("");
  const [availabilityPlate, setAvailabilityPlate] = useState("");
  const [priceRecalcHint, setPriceRecalcHint] = useState("");
  const [baseAmount, setBaseAmount] = useState(String(initialValues?.baseAmount ?? "0"));
  const legacyDiscountAmount = parseNumberInput(String(initialValues?.discountAmount ?? "0"));
  const [selectedDiscountPercent, setSelectedDiscountPercent] = useState("");
  const [selectedDiscounts, setSelectedDiscounts] = useState<Array<{ percent: number; amount: number }>>(
    parseDiscountBreakdown(String(initialValues?.discountBreakdown ?? "")),
  );
  const [fuelAmount, setFuelAmount] = useState(String(initialValues?.fuelAmount ?? "0"));
  const [insuranceAmount, setInsuranceAmount] = useState(String(initialValues?.insuranceAmount ?? "0"));
  const [penaltiesAmount, setPenaltiesAmount] = useState(String(initialValues?.penaltiesAmount ?? "0"));
  const [selectedExtraId, setSelectedExtraId] = useState(extraOptions[0]?.id ?? "");
  const [extraUnitsInput, setExtraUnitsInput] = useState("1");
  const [selectedExtras, setSelectedExtras] = useState<
    Array<{
      extraId: string;
      code: string;
      name: string;
      priceMode: "FIJO" | "POR_DIA";
      unitPrice: number;
      units: number;
      amount: number;
    }>
  >([]);
  const [additionalDriverName, setAdditionalDriverName] = useState(parsedAdditionalDrivers.name);
  const [additionalDriverLicense, setAdditionalDriverLicense] = useState(parsedAdditionalDrivers.license);
  const [publicNotes, setPublicNotes] = useState(String(initialValues?.publicNotes ?? ""));
  const [privateNotes, setPrivateNotes] = useState(String(initialValues?.privateNotes ?? ""));

  const lookupMatches = useMemo(() => {
    const q = clientLookup.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((client) =>
        [
          client.clientCode,
          client.id,
          clientDisplayName(client),
          client.companyName,
          client.commissionerName,
          client.documentNumber,
          client.licenseNumber,
          client.email,
          client.phone1,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [clientLookup, clients]);

  const legacyExtrasAmount = parseNumberInput(String(initialValues?.extrasAmount ?? "0"));
  const extrasAmountComputed = useMemo(() => selectedExtras.reduce((sum, item) => sum + item.amount, 0), [selectedExtras]);
  const visibleExtras = useMemo(() => {
    if (selectedExtras.length > 0) return selectedExtras;
    if (legacyExtrasAmount > 0) {
      return [
        {
          extraId: "legacy",
          code: "EXT",
          name: "Extra contratado",
          priceMode: "FIJO" as const,
          unitPrice: legacyExtrasAmount,
          units: 1,
          amount: legacyExtrasAmount,
        },
      ];
    }
    return [];
  }, [legacyExtrasAmount, selectedExtras]);
  const extrasAmount = selectedExtras.length > 0 ? extrasAmountComputed : legacyExtrasAmount;
  const additionalDriversPayload = useMemo(() => {
    const name = additionalDriverName.trim();
    const license = additionalDriverLicense.trim();
    if (!name && !license) return "";
    return `Nombre: ${name} | Permiso: ${license}`;
  }, [additionalDriverLicense, additionalDriverName]);
  const extrasBreakdown = useMemo(
    () =>
      visibleExtras.length === 0
        ? String(initialValues?.extrasBreakdown ?? "")
        : visibleExtras
            .map((item) => `${item.code}:${item.name} x${item.units} (${item.priceMode === "POR_DIA" ? "día" : "fijo"}) = ${item.amount.toFixed(2)}`)
            .join(" | "),
    [initialValues?.extrasBreakdown, visibleExtras],
  );
  const groupOptions = useMemo(() => Array.from(new Set(allGroups.filter(Boolean))).toSorted((a, b) => a.localeCompare(b)), [allGroups]);
  const availablePlatesForGroup = useMemo(
    () =>
      getAvailablePlatesForGroup({
        requestedGroup: assignedVehicleGroup,
        deliveryAt,
        pickupAt,
        vehicles,
        reservations,
        contracts,
      }),
    [assignedVehicleGroup, contracts, deliveryAt, pickupAt, reservations, vehicles],
  );
  const groupPlates = useMemo(
    () =>
      getAvailablePlatesForGroup({
        requestedGroup: availabilityGroup,
        deliveryAt,
        pickupAt,
        vehicles,
        reservations,
        contracts,
      }),
    [availabilityGroup, contracts, deliveryAt, pickupAt, reservations, vehicles],
  );
  const companyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clients
            .filter((client) => client.clientType === "EMPRESA")
            .map((client) => client.companyName?.trim() ?? "")
            .filter(Boolean),
        ),
      ).toSorted((a, b) => a.localeCompare(b)),
    [clients],
  );
  const commissionerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clients
            .filter((client) => client.clientType === "COMISIONISTA")
            .map((client) => client.commissionerName?.trim() ?? "")
            .filter(Boolean),
        ),
      ).toSorted((a, b) => a.localeCompare(b)),
    [clients],
  );
  const autoDetectedRateCode = useMemo(() => resolveAutoRateCodeForDate(tariffCatalogs, deliveryAt), [deliveryAt, tariffCatalogs]);
  const hasActiveAppliedRate = appliedRate ? isRateCodeActiveForDate(tariffCatalogs, appliedRate, deliveryAt) : false;
  const effectiveRateCode = (hasActiveAppliedRate ? appliedRate : autoDetectedRateCode || appliedRate).trim();
  const rateCode = effectiveRateCode.toUpperCase();
  const groupCode = billedCarGroup.trim().toUpperCase();
  const plansForRate = useMemo(
    () => (rateCode ? tariffCatalogs.filter((item) => item.plan.code.trim().toUpperCase() === rateCode) : []),
    [rateCode, tariffCatalogs],
  );
  const billedDays = useMemo(() => {
    const derived = computeBilledDaysBy24h(deliveryAt, pickupAt, globalCourtesyHours);
    const initial = parseNumberInput(String(initialValues?.billedDays ?? "0"));
    return derived > 0 ? derived : Math.max(1, initial);
  }, [deliveryAt, globalCourtesyHours, initialValues?.billedDays, pickupAt]);
  const selectedExtraOption = useMemo(
    () => extraOptions.find((item) => item.id === selectedExtraId) ?? null,
    [extraOptions, selectedExtraId],
  );
  const selectedExtraUnits = useMemo(() => {
    if (!selectedExtraOption) return 0;
    return Math.max(1, parseNumberInput(extraUnitsInput));
  }, [extraUnitsInput, selectedExtraOption]);
  const selectedExtraChargeDays = useMemo(() => {
    if (!selectedExtraOption || selectedExtraOption.priceMode !== "POR_DIA") return 0;
    return selectedExtraOption.maxDays > 0 ? Math.min(billedDays, selectedExtraOption.maxDays) : billedDays;
  }, [billedDays, selectedExtraOption]);
  const selectedExtraUnitPrice = selectedExtraOption ? selectedExtraOption.unitPrice.toFixed(2) : "";
  const selectedExtraTotalPrice = selectedExtraOption
    ? (
        selectedExtraOption.priceMode === "POR_DIA"
          ? selectedExtraOption.unitPrice * selectedExtraUnits * selectedExtraChargeDays
          : selectedExtraOption.unitPrice * selectedExtraUnits
      ).toFixed(2)
    : "";
  const autoQuote = useMemo(
    () =>
      !rateCode || !groupCode || billedDays <= 0 || plansForRate.length === 0
        ? null
        : calculateTariffAmountFromPlans({
            plans: plansForRate,
            groupCode,
            billedDays,
            deliveryAt,
            pickupAt,
          }),
    [billedDays, deliveryAt, groupCode, pickupAt, plansForRate, rateCode],
  );
  const autoBaseAmount = autoQuote?.found ? autoQuote.amount.toFixed(2) : null;
  const effectiveBaseAmount = !priceLocked && autoBaseAmount !== null && autoPriceEnabled ? autoBaseAmount : baseAmount;
  const effectiveBaseAmountNumber = parseNumberInput(effectiveBaseAmount);
  const resolvedAppliedRateCode = useMemo(() => {
    const normalizedAppliedRate = appliedRate.trim().toUpperCase();
    const normalizedDetectedRate = autoDetectedRateCode.trim().toUpperCase();
    if (!autoPriceEnabled) {
      return effectiveBaseAmountNumber > 0 ? SPECIAL_RATE_CODE_MANUAL : normalizedAppliedRate;
    }
    if (autoQuote?.found) {
      return autoQuote.isSeasonSplit ? SPECIAL_RATE_CODE_SEASON_CROSS : rateCode;
    }
    if (normalizedAppliedRate === SPECIAL_RATE_CODE_MANUAL || normalizedAppliedRate === SPECIAL_RATE_CODE_SEASON_CROSS) {
      return normalizedAppliedRate;
    }
    if (hasActiveAppliedRate && normalizedAppliedRate) {
      return normalizedAppliedRate;
    }
    return normalizedDetectedRate || normalizedAppliedRate;
  }, [appliedRate, autoDetectedRateCode, autoPriceEnabled, autoQuote, effectiveBaseAmountNumber, hasActiveAppliedRate, rateCode]);
  const displayedRateCode = useMemo(() => {
    if (resolvedAppliedRateCode === SPECIAL_RATE_CODE_MANUAL || resolvedAppliedRateCode === SPECIAL_RATE_CODE_SEASON_CROSS) {
      return resolvedAppliedRateCode;
    }
    return effectiveRateCode;
  }, [effectiveRateCode, resolvedAppliedRateCode]);
  const computedDiscountRows = useMemo(
    () =>
      selectedDiscounts.map((item) => ({
        percent: item.percent,
        amount: Number(((effectiveBaseAmountNumber * item.percent) / 100).toFixed(2)),
      })),
    [effectiveBaseAmountNumber, selectedDiscounts],
  );
  const discountAmount = useMemo(
    () =>
      computedDiscountRows.length > 0
        ? computedDiscountRows.reduce((sum, item) => sum + item.amount, 0)
        : legacyDiscountAmount,
    [computedDiscountRows, legacyDiscountAmount],
  );
  const total = useMemo(
    () =>
      effectiveBaseAmountNumber -
      discountAmount +
      extrasAmount +
      parseNumberInput(fuelAmount) +
      parseNumberInput(insuranceAmount) +
      parseNumberInput(penaltiesAmount),
    [discountAmount, effectiveBaseAmountNumber, extrasAmount, fuelAmount, insuranceAmount, penaltiesAmount],
  );

  function fillFromClient(client: ClientLite) {
    const name = clientDisplayName(client);
    setCustomerId(client.clientCode);
    setCustomerName(name);
    setCustomerCompany(String(client.companyName ?? ""));
    setCustomerCommissioner(String(client.commissionerName ?? ""));
    setSalesChannel(String(client.acquisitionChannel ?? ""));
    setClientLookup(`${name} (${client.clientCode})`);
  }

  function autoFillFromCustomerId(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const found =
      clients.find((client) => client.clientCode.trim().toUpperCase() === value.toUpperCase()) ??
      clients.find((client) => client.id === value) ??
      null;
    if (found) fillFromClient(found);
  }

  function autoFillFromCustomerName(rawValue: string) {
    const value = rawValue.trim().toLowerCase();
    if (!value) return;
    const exact = clients.find((client) => clientDisplayName(client).trim().toLowerCase() === value);
    const startsWith = clients.find((client) => clientDisplayName(client).trim().toLowerCase().startsWith(value));
    const found = exact ?? startsWith ?? null;
    if (found) fillFromClient(found);
  }

  function handleAssignedPlateChange(nextPlate: string) {
    setAssignedPlate(nextPlate);
    const found = vehicles.find((vehicle) => vehicle.plate.toUpperCase() === nextPlate.trim().toUpperCase());
    setAssignedVehicleGroup(found?.groupLabel || "");
  }

  function handleAssignedVehicleGroupChange(nextGroup: string) {
    setAssignedVehicleGroup(nextGroup);
    resetAssignedPlateIfUnavailable(nextGroup, deliveryAt, pickupAt);
  }

  function resetAssignedPlateIfUnavailable(nextGroup: string, nextDeliveryAt: string, nextPickupAt: string) {
    const nextAvailablePlates = getAvailablePlatesForGroup({
      requestedGroup: nextGroup,
      deliveryAt: nextDeliveryAt,
      pickupAt: nextPickupAt,
      vehicles,
      reservations,
      contracts,
    });
    if (assignedPlate && !nextAvailablePlates.includes(assignedPlate)) {
      setAssignedPlate("");
    }
    if (availabilityPlate && !nextAvailablePlates.includes(availabilityPlate)) {
      setAvailabilityPlate("");
    }
  }

  function handleBranchDeliveryChange(nextBranch: string) {
    setBranchDelivery(nextBranch);
    if (!pickupBranch || pickupBranch === branchDelivery) {
      setPickupBranch(nextBranch);
    }
  }

  function handleDeliveryAtChange(nextValue: string) {
    setDeliveryAt(nextValue);
    resetAssignedPlateIfUnavailable(assignedVehicleGroup, nextValue, pickupAt);
  }

  function handlePickupAtChange(nextValue: string) {
    setPickupAt(nextValue);
    resetAssignedPlateIfUnavailable(assignedVehicleGroup, deliveryAt, nextValue);
  }

  function handleAppliedRateChange(nextRate: string) {
    setAppliedRate(nextRate);
    setAutoPriceEnabled(true);
  }

  function handleBilledGroupChange(nextGroup: string) {
    const previousGroup = billedCarGroup.trim().toUpperCase();
    const normalizedNext = nextGroup.trim().toUpperCase();
    const changed = previousGroup !== "" && normalizedNext !== "" && previousGroup !== normalizedNext;
    setBilledCarGroup(nextGroup);
    if (!assignedVehicleGroup) {
      setAssignedVehicleGroup(nextGroup);
      resetAssignedPlateIfUnavailable(nextGroup, deliveryAt, pickupAt);
    }
    if (priceLocked || !changed) return;
    const shouldRecalculate = window.confirm("Has cambiado el grupo. ¿Quieres actualizar al precio del nuevo grupo?");
    if (shouldRecalculate) {
      setAutoPriceEnabled(true);
      setPriceRecalcHint("El precio del alquiler se ha recalculado con el grupo seleccionado.");
    } else {
      setAutoPriceEnabled(false);
      setPriceRecalcHint("");
    }
  }

  function addExtraLine() {
    const extra = extraOptions.find((item) => item.id === selectedExtraId);
    if (!extra) return;
    const rawUnits = Math.max(1, parseNumberInput(extraUnitsInput));
    const units = rawUnits;
    const chargeDays = extra.priceMode === "POR_DIA" ? (extra.maxDays > 0 ? Math.min(billedDays, extra.maxDays) : billedDays) : 0;
    const amount = extra.priceMode === "POR_DIA" ? extra.unitPrice * units * chargeDays : extra.unitPrice * units;
    setSelectedExtras((current) => [
      ...current,
      {
        extraId: extra.id,
        code: extra.code,
        name: extra.name,
        priceMode: extra.priceMode,
        unitPrice: extra.unitPrice,
        units,
        amount,
      },
    ]);
  }

  function removeExtraLine(index: number) {
    setSelectedExtras((current) => current.filter((_, idx) => idx !== index));
  }

  function addDiscountLine() {
    const percent = parseNumberInput(selectedDiscountPercent);
    if (percent <= 0) return;
    setSelectedDiscounts((current) => [...current, { percent: Number(percent.toFixed(2)), amount: 0 }]);
    setSelectedDiscountPercent("");
  }

  function removeDiscountLine(index: number) {
    setSelectedDiscounts((current) => current.filter((_, idx) => idx !== index));
  }

  return (
    <form action={action} className="stack-md">
      <div className="reservation-create-layout">
        <div className="stack-md">
          <section className="card-muted stack-sm">
            <h4>Cliente</h4>
            <div className="table-header-row">
              <a className="secondary-btn text-center" href="/clientes?tab=ficha">
                Crear cliente
              </a>
            </div>
            <div className="form-grid">
              <label className="col-span-2">
                Buscar cliente
                <input
                  value={clientLookup}
                  onChange={(event) => setClientLookup(event.target.value)}
                  placeholder="Nombre, documento, email, teléfono o código"
                  disabled={!canWrite}
                />
              </label>
              {lookupMatches.length > 0 ? (
                <div className="col-span-2 quick-pick-list">
                  {lookupMatches.map((client) => (
                    <button key={client.id} type="button" className="quick-pick-item" onClick={() => fillFromClient(client)} disabled={!canWrite}>
                      {clientDisplayName(client)} · {client.clientCode} · {client.clientType}
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                ID cliente
                <input
                  name="customerId"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  onBlur={(event) => autoFillFromCustomerId(event.target.value)}
                  placeholder="Código cliente"
                  disabled={!canWrite}
                />
              </label>
              <label>
                Cliente *
                <input
                  name="customerName"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  onBlur={(event) => autoFillFromCustomerName(event.target.value)}
                  required
                  disabled={!canWrite}
                />
              </label>
              <label>
                Empresa
                <select name="customerCompany" value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {companyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comisionista
                <select
                  name="customerCommissioner"
                  value={customerCommissioner}
                  onChange={(event) => setCustomerCommissioner(event.target.value)}
                  disabled={!canWrite}
                >
                  <option value="">Selecciona</option>
                  {commissionerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card-muted stack-sm">
            <h4>Entrega y recogida</h4>
            <div className="form-grid">
              <label>
                Sucursal entrega *
                <select name="branchDelivery" value={branchDelivery} onChange={(event) => handleBranchDeliveryChange(event.target.value)} required disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {branches.map((branch) => (
                    <option key={`delivery-${branch.code}`} value={branch.code}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lugar entrega
                <input name="deliveryPlace" defaultValue={initialValues?.deliveryPlace ?? ""} disabled={!canWrite} />
              </label>
              <label>
                Fecha/hora entrega *
                <input name="deliveryAt" type="datetime-local" value={deliveryAt} onChange={(event) => handleDeliveryAtChange(event.target.value)} required disabled={!canWrite} />
              </label>
              <label>
                Sucursal recogida
                <select name="pickupBranch" value={pickupBranch} onChange={(event) => setPickupBranch(event.target.value)} disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {branches.map((branch) => (
                    <option key={`pickup-${branch.code}`} value={branch.code}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lugar recogida
                <input name="pickupPlace" defaultValue={initialValues?.pickupPlace ?? ""} disabled={!canWrite} />
              </label>
              <label>
                Fecha/hora recogida *
                <input name="pickupAt" type="datetime-local" value={pickupAt} onChange={(event) => handlePickupAtChange(event.target.value)} required disabled={!canWrite} />
              </label>
              <label className="field-compact">
                Canal de venta
                <select name="salesChannel" value={salesChannel} onChange={(event) => setSalesChannel(event.target.value)} disabled={!canWrite}>
                  <option value="">Sin canal</option>
                  {salesChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card-muted stack-sm">
            <h4>Vehículo</h4>
            <div className="form-grid">
              <label className="field-compact">
                Grupo reservado *
                <select name="billedCarGroup" value={billedCarGroup} onChange={(event) => handleBilledGroupChange(event.target.value)} required disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {groupOptions.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-compact">
                Vehículo disponible
                <select
                  name="assignedPlate"
                  value={assignedPlate}
                  onChange={(event) => handleAssignedPlateChange(event.target.value)}
                  disabled={!canWrite || !assignedVehicleGroup || !deliveryAt || !pickupAt}
                >
                  <option value="">Selecciona</option>
                  {availablePlatesForGroup.map((plate) => (
                    <option key={plate} value={plate}>
                      {plate}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-compact">
                Grupo entregado
                <select name="assignedVehicleGroup" value={assignedVehicleGroup} onChange={(event) => handleAssignedVehicleGroupChange(event.target.value)} disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {groupOptions.map((group) => (
                    <option key={`assigned-${group}`} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Override disponibilidad
                <select name="overrideAccepted" defaultValue="false" disabled={!canWrite}>
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </label>
              <label className="col-span-2">
                Motivo override
                <input name="overrideReason" disabled={!canWrite} />
              </label>
            </div>
            {priceRecalcHint ? <p className="muted-text">{priceRecalcHint}</p> : null}
          </section>
        </div>

        <aside className="price-side-card">
          <h4>Liquidación</h4>
          <label>
            Días facturados
            <input name="billedDays" type="number" min={1} value={String(billedDays)} readOnly />
          </label>
          <label>
            Tarifa
            <select value={displayedRateCode} onChange={(event) => handleAppliedRateChange(event.target.value)} disabled={!canWrite}>
              <option value="">Sin tarifa</option>
              {resolvedAppliedRateCode === SPECIAL_RATE_CODE_SEASON_CROSS ? <option value={SPECIAL_RATE_CODE_SEASON_CROSS}>TXT - Cruce de temporadas</option> : null}
              {resolvedAppliedRateCode === SPECIAL_RATE_CODE_MANUAL ? <option value={SPECIAL_RATE_CODE_MANUAL}>MAN - Precio manual</option> : null}
              {tariffOptions.map((option) => (
                <option key={option.id} value={option.code}>
                  {option.code} - {option.title}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="ivaPercent" value={initialValues?.ivaPercent ?? "21"} readOnly />
          <label>
            Alquiler
            <input
              name="baseAmount"
              type="number"
              step="0.01"
              value={effectiveBaseAmount}
              onChange={(event) => {
                setBaseAmount(event.target.value);
                setAutoPriceEnabled(false);
              }}
              disabled={!canWrite}
            />
          </label>
          <label>
            Descuento
            <input name="discountAmountPreview" type="number" step="0.01" value={discountAmount.toFixed(2)} readOnly />
          </label>
          <label>
            Combustible
            <input name="fuelAmount" type="number" step="0.01" value={fuelAmount} onChange={(event) => setFuelAmount(event.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Extras
            <input name="extrasAmountPreview" type="number" step="0.01" value={extrasAmount.toFixed(2)} readOnly />
          </label>
          <label>
            Franquicia
            <input name="deductible" defaultValue={initialValues?.deductible ?? ""} disabled={!canWrite} />
          </label>
          <label>
            Fianza
            <input name="depositAmount" type="number" step="0.01" defaultValue={initialValues?.depositAmount ?? "0"} disabled={!canWrite} />
          </label>
          <label>
            Pagos realizados
            <input name="paymentsMade" type="number" step="0.01" defaultValue={initialValues?.paymentsMade ?? "0"} disabled={!canWrite} />
          </label>
          <label>
            CDW
            <input name="insuranceAmount" type="number" step="0.01" value={insuranceAmount} onChange={(event) => setInsuranceAmount(event.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Extension
            <input name="penaltiesAmount" type="number" step="0.01" value={penaltiesAmount} onChange={(event) => setPenaltiesAmount(event.target.value)} disabled={!canWrite} />
          </label>
          <div className="price-total-box">
            <span>Total</span>
            <strong>{total.toFixed(2)}</strong>
          </div>
        </aside>
      </div>

      <section className="card-muted stack-sm">
        <div className="table-header-row">
          <button
            type="button"
            className={activeBottomTab === "notas-publicas" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveBottomTab("notas-publicas")}
          >
            Notas públicas
          </button>
          <button
            type="button"
            className={activeBottomTab === "notas-privadas" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveBottomTab("notas-privadas")}
          >
            Notas privadas
          </button>
          <button
            type="button"
            className={activeBottomTab === "extras" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveBottomTab("extras")}
          >
            Extras
          </button>
          <button
            type="button"
            className={activeBottomTab === "conductores" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveBottomTab("conductores")}
          >
            Conductores adicionales
          </button>
        </div>

        {activeBottomTab === "notas-publicas" ? (
          <div className="form-grid">
            <textarea className="col-span-2" name="publicNotes" rows={3} value={publicNotes} onChange={(event) => setPublicNotes(event.target.value)} disabled={!canWrite} />
          </div>
        ) : null}

        {activeBottomTab === "notas-privadas" ? (
          <div className="form-grid">
            <textarea className="col-span-2" name="privateNotes" rows={3} value={privateNotes} onChange={(event) => setPrivateNotes(event.target.value)} disabled={!canWrite} />
          </div>
        ) : null}

        {activeBottomTab === "extras" ? (
          <div className="form-grid">
            <div className="extras-inline-row col-span-2">
              <label className="extras-inline-main">
                Extra
                <select value={selectedExtraId} onChange={(event) => setSelectedExtraId(event.target.value)} disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {extraOptions.map((extra) => (
                    <option key={extra.id} value={extra.id}>
                      {extra.code} - {extra.name} ({extra.priceMode === "POR_DIA" ? "día" : "fijo"}) {extra.unitPrice.toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="extras-inline-mini">
                Unidades
                <input value={extraUnitsInput} onChange={(event) => setExtraUnitsInput(event.target.value)} type="number" min={1} disabled={!canWrite} />
              </label>
              <label className="extras-inline-mini">
                Precio ud.
                <input value={selectedExtraUnitPrice} readOnly />
              </label>
              <label className="extras-inline-mini">
                Total
                <input value={selectedExtraTotalPrice} readOnly />
              </label>
              <button type="button" className="secondary-btn extras-inline-add" onClick={addExtraLine} disabled={!canWrite || !selectedExtraId}>
                Añadir extra
              </button>
            </div>
            <div className="extras-inline-row col-span-2">
              <label className="extras-inline-main">
                Descuento
                <input
                  value={selectedDiscountPercent}
                  onChange={(event) => setSelectedDiscountPercent(event.target.value)}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="% sobre alquiler"
                  disabled={!canWrite}
                />
              </label>
              <label className="extras-inline-mini">
                Base
                <input value={effectiveBaseAmountNumber.toFixed(2)} readOnly />
              </label>
              <label className="extras-inline-mini">
                Importe
                <input
                  value={selectedDiscountPercent ? ((effectiveBaseAmountNumber * parseNumberInput(selectedDiscountPercent)) / 100).toFixed(2) : ""}
                  readOnly
                />
              </label>
              <button type="button" className="secondary-btn extras-inline-add" onClick={addDiscountLine} disabled={!canWrite || parseNumberInput(selectedDiscountPercent) <= 0}>
                Añadir descuento
              </button>
            </div>
            {visibleExtras.length > 0 ? (
              <div className="col-span-2 table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Extra</th>
                      <th>Tipo</th>
                      <th>Unidades</th>
                      <th>Importe</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExtras.map((item, index) => (
                      <tr key={`${item.extraId}-${index}`}>
                        <td>{item.code} - {item.name}</td>
                        <td>{item.priceMode === "POR_DIA" ? "Por día" : "Fijo"}</td>
                        <td>{item.units}</td>
                        <td>{item.amount.toFixed(2)}</td>
                        <td>
                          {item.extraId === "legacy" ? null : (
                            <button type="button" className="secondary-btn" onClick={() => removeExtraLine(index)} disabled={!canWrite}>
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="col-span-2 muted-text">Sin extras añadidos.</p>
            )}
            {computedDiscountRows.length > 0 ? (
              <div className="col-span-2 table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descuento</th>
                      <th>%</th>
                      <th>Importe</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedDiscountRows.map((item, index) => (
                      <tr key={`discount-${index}`}>
                        <td>Sobre alquiler</td>
                        <td>{item.percent.toFixed(2)}%</td>
                        <td>-{item.amount.toFixed(2)}</td>
                        <td>
                          <button type="button" className="secondary-btn" onClick={() => removeDiscountLine(index)} disabled={!canWrite}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeBottomTab === "conductores" ? (
          <div className="form-grid">
            <label>
              Nombre
              <input value={additionalDriverName} onChange={(event) => setAdditionalDriverName(event.target.value)} disabled={!canWrite} />
            </label>
            <label>
              Permiso de conducir
              <input value={additionalDriverLicense} onChange={(event) => setAdditionalDriverLicense(event.target.value)} disabled={!canWrite} />
            </label>
          </div>
        ) : null}

        <div className="table-header-row">
          <button className="primary-btn" type="submit" disabled={!canWrite}>
            Crear contrato
          </button>
          <button
            className="secondary-btn"
            type="button"
            disabled={!canWrite}
            onClick={() => {
              setClientLookup("");
              setCustomerId("");
              setCustomerName("");
              setCustomerCompany("");
              setCustomerCommissioner("");
              setSalesChannel("");
              setBranchDelivery(initialBranchCode);
              setPickupBranch(initialBranchCode);
              setDeliveryAt("");
              setPickupAt("");
              setAppliedRate("");
              setBilledCarGroup("");
              setAssignedPlate("");
              setAssignedVehicleGroup("");
              setPriceLocked(false);
              setAutoPriceEnabled(true);
              setShowAvailability(false);
              setAvailabilityGroup("");
              setAvailabilityPlate("");
              setPriceRecalcHint("");
              setBaseAmount("0");
              setSelectedDiscounts([]);
              setFuelAmount("0");
              setInsuranceAmount("0");
              setPenaltiesAmount("0");
              setSelectedExtraId(extraOptions[0]?.id ?? "");
              setExtraUnitsInput("1");
              setSelectedExtras([]);
              setAdditionalDriverName("");
              setAdditionalDriverLicense("");
              setPublicNotes("");
              setPrivateNotes("");
            }}
          >
            Limpiar campos
          </button>
          <button
            className={priceLocked ? "primary-btn" : "secondary-btn"}
            type="button"
            onClick={() => {
              if (!priceLocked) setBaseAmount(effectiveBaseAmount);
              setPriceLocked((current) => !current);
            }}
            disabled={!canWrite}
          >
            {priceLocked ? "Precios bloqueados" : "Bloquear precios"}
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => {
              setAvailabilityGroup(assignedVehicleGroup);
              setShowAvailability((current) => !current);
            }}
          >
            Disponibilidad
          </button>
          <a className="secondary-btn text-center" href="/contratos?tab=historico">
            Auditoría
          </a>
        </div>

        {showAvailability ? (
          <div className="form-grid">
            <label>
              Grupo entregado
              <select
                value={availabilityGroup}
                onChange={(event) => {
                  setAvailabilityGroup(event.target.value);
                  setAvailabilityPlate("");
                }}
              >
                <option value="">Selecciona grupo</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vehículo disponible
              <select
                value={availabilityPlate}
                onChange={(event) => {
                  const plate = event.target.value;
                  setAvailabilityPlate(plate);
                  if (plate) handleAssignedPlateChange(plate);
                }}
                disabled={!availabilityGroup}
              >
                <option value="">Selecciona vehículo</option>
                {groupPlates.map((plate) => (
                  <option key={plate} value={plate}>
                    {plate}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <input type="hidden" name="selectedExtrasPayload" value={JSON.stringify(selectedExtras.map((item) => ({ extraId: item.extraId, units: item.units })))} readOnly />
        <input type="hidden" name="appliedRate" value={resolvedAppliedRateCode} readOnly />
        <input type="hidden" name="extrasBreakdown" value={extrasBreakdown} readOnly />
      <input type="hidden" name="extrasAmount" value={extrasAmount.toFixed(2)} readOnly />
      <input type="hidden" name="discountAmount" value={discountAmount.toFixed(2)} readOnly />
      <input type="hidden" name="discountBreakdown" value={JSON.stringify(computedDiscountRows)} readOnly />
      <input type="hidden" name="selectedDiscountsPayload" value={JSON.stringify(computedDiscountRows.map((item) => ({ percent: item.percent })))} readOnly />
      <input type="hidden" name="totalPrice" value={total.toFixed(2)} readOnly />
      <input type="hidden" name="additionalDrivers" value={additionalDriversPayload} readOnly />
      <input type="hidden" name="publicObservations" value="" readOnly />
      <input type="hidden" name="privateObservations" value="" readOnly />
    </form>
  );
}
