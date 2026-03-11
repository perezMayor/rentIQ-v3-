"use client";

import { startTransition, useMemo, useState } from "react";
import { buildBudgetTemplateData, getBudgetBaseTemplate, renderTemplateWithMacros } from "@/lib/services/template-renderer";

type TariffCatalog = {
  plan: {
    id: string;
    code: string;
    title: string;
    validFrom: string;
    validTo: string;
    updatedAt: string;
  };
  brackets: Array<{ id: string; fromDay: number; toDay: number; order: number; label: string }>;
  prices: Array<{ bracketId: string; groupCode: string; price: number }>;
};

type OptionItem = {
  id: string;
  code: string;
  name: string;
  priceMode: "FIJO" | "POR_DIA";
  unitPrice: number;
  maxDays: number;
};

type AddedLine = {
  id: string;
  code: string;
  name: string;
  priceMode: "FIJO" | "POR_DIA";
  units: number;
  amount: number;
};

type Props = {
  tariffCatalogs: TariffCatalog[];
  groups: string[];
  insuranceOptions: OptionItem[];
  extraOptions: OptionItem[];
  courtesyHours: number;
  canWrite: boolean;
  previewTemplateHtml: string;
  previewLanguage: string;
  previewCompany: {
    name: string;
    taxId: string;
    fiscalAddress: string;
    emailFrom: string;
    phone: string;
    website: string;
    footer: string;
    logoDataUrl: string;
    brandPrimaryColor: string;
    brandSecondaryColor: string;
  };
  sendBudgetEmailAction: (input: {
    toEmail: string;
    language: string;
    deliveryAt: string;
    deliveryPlace: string;
    pickupAt: string;
    pickupPlace: string;
    billedCarGroup: string;
    billedDays: number;
    appliedRate: string;
    baseAmount: number;
    discountAmount: number;
    insuranceAmount: number;
    extrasAmount: number;
    fuelAmount: number;
    totalAmount: number;
    extrasBreakdown: string;
  }) => Promise<void>;
};

function parseNumberInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateSafe(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function formatDateDisplay(value: string): string {
  const parsed = parseDateSafe(`${value}T00:00:00`);
  if (!parsed) return value;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function resolveTariffAmountForPlanDays(input: {
  brackets: Array<{ id: string; fromDay: number; toDay: number; order: number; label: string }>;
  prices: Array<{ bracketId: string; groupCode: string; price: number }>;
  groupCode: string;
  targetDays: number;
}): { found: boolean; amount: number; bracketLabel: string } {
  const days = Math.max(1, Math.floor(input.targetDays));
  const groupCode = input.groupCode.trim().toUpperCase();
  const brackets = [...input.brackets].sort((a, b) => a.order - b.order);
  const exact = brackets.find((item) => days >= item.fromDay && days <= item.toDay);
  if (exact) {
    const priceRow = input.prices.find((item) => item.bracketId === exact.id && item.groupCode.trim().toUpperCase() === groupCode);
    if (priceRow) {
      return { found: true, amount: Number(priceRow.price.toFixed(2)), bracketLabel: exact.label };
    }
  }
  const lower = [...brackets].filter((item) => item.toDay < days).sort((a, b) => b.toDay - a.toDay)[0];
  if (!lower) return { found: false, amount: 0, bracketLabel: "" };
  const lowerPrice = input.prices.find((item) => item.bracketId === lower.id && item.groupCode.trim().toUpperCase() === groupCode);
  if (!lowerPrice || lower.toDay <= 0) return { found: false, amount: 0, bracketLabel: "" };
  const perDay = lowerPrice.price / lower.toDay;
  return {
    found: true,
    amount: Number((perDay * days).toFixed(2)),
    bracketLabel: `${lower.label} prorrateado`,
  };
}

function selectTariffPlanForDate(plans: TariffCatalog[], dateKey: string, fallbackPlanId: string) {
  const dayNumber = dateOnlyToDayNumber(dateKey);
  if (dayNumber === null) return plans.find((item) => item.plan.id === fallbackPlanId) ?? plans[0] ?? null;
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

function calculateTariffAmountFromPlans(input: {
  plans: TariffCatalog[];
  preferredPlanId: string;
  groupCode: string;
  billedDays: number;
  deliveryAt: string;
  pickupAt: string;
}) {
  const days = Math.max(1, Math.floor(input.billedDays));
  if (input.plans.length === 0) return { found: false, amount: 0, bracketLabel: "", segmentPlanIds: [] as string[] };
  const fallbackPlan =
    input.plans.find((item) => item.plan.id === input.preferredPlanId) ??
    [...input.plans].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt))[0];
  const start = parseDateSafe(input.deliveryAt);
  const end = parseDateSafe(input.pickupAt);
  const canSplitBySeason = Boolean(start && end && end.getTime() > start.getTime() && days > 1);
  if (!fallbackPlan) return { found: false, amount: 0, bracketLabel: "", segmentPlanIds: [] as string[] };

  if (!canSplitBySeason) {
    const base = resolveTariffAmountForPlanDays({
      brackets: fallbackPlan.brackets,
      prices: fallbackPlan.prices,
      groupCode: input.groupCode,
      targetDays: days,
    });
    return { found: base.found, amount: base.amount, bracketLabel: base.bracketLabel, segmentPlanIds: base.found ? [fallbackPlan.plan.id] : [] };
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
    const planId = planDays.keys().next().value as string | undefined;
    const plan = input.plans.find((item) => item.plan.id === planId) ?? fallbackPlan;
    const base = resolveTariffAmountForPlanDays({
      brackets: plan.brackets,
      prices: plan.prices,
      groupCode: input.groupCode,
      targetDays: blocks,
    });
    return { found: base.found, amount: base.amount, bracketLabel: base.bracketLabel, segmentPlanIds: base.found ? [plan.plan.id] : [] };
  }

  const referenceDays = blocks < 7 ? 3 : 7;
  let total = 0;
  for (const [planId, segmentDays] of planDays.entries()) {
    const plan = input.plans.find((item) => item.plan.id === planId);
    if (!plan) return { found: false, amount: 0, bracketLabel: "", segmentPlanIds: [] as string[] };
    const base = resolveTariffAmountForPlanDays({
      brackets: plan.brackets,
      prices: plan.prices,
      groupCode: input.groupCode,
      targetDays: referenceDays,
    });
    if (!base.found || referenceDays <= 0) return { found: false, amount: 0, bracketLabel: "", segmentPlanIds: [] as string[] };
    total += Number(((base.amount / referenceDays) * segmentDays).toFixed(2));
  }
  return { found: true, amount: Number(total.toFixed(2)), bracketLabel: "Cruce de temporadas", segmentPlanIds: Array.from(planDays.keys()) };
}

function buildLine(option: OptionItem | null, unitsInput: string, billedDays: number): AddedLine | null {
  if (!option) return null;
  const units = Math.max(1, Math.floor(parseNumberInput(unitsInput) || 1));
  const chargeDays = option.priceMode === "POR_DIA" ? (option.maxDays > 0 ? Math.min(billedDays, option.maxDays) : billedDays) : 0;
  const amount = option.priceMode === "POR_DIA" ? option.unitPrice * chargeDays * units : option.unitPrice * units;
  return {
    id: option.id,
    code: option.code,
    name: option.name,
    priceMode: option.priceMode,
    units,
    amount: Number(amount.toFixed(2)),
  };
}

function buildExtrasBreakdown(selectedExtras: AddedLine[]) {
  return selectedExtras
    .map((item) => `${item.code}: ${item.name} x${item.units}=${item.amount.toFixed(2)}`)
    .join(" | ");
}

export function ReservationBudgetTab({
  tariffCatalogs,
  groups,
  insuranceOptions,
  extraOptions,
  courtesyHours,
  canWrite,
  previewTemplateHtml,
  previewLanguage,
  previewCompany,
  sendBudgetEmailAction,
}: Props) {
  const [deliveryAt, setDeliveryAt] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [selectedTariffPlanId, setSelectedTariffPlanId] = useState(tariffCatalogs[0]?.plan.id ?? "");
  const [selectedGroup, setSelectedGroup] = useState(groups[0] ?? "");
  const [selectedInsuranceId, setSelectedInsuranceId] = useState("");
  const [selectedExtraId, setSelectedExtraId] = useState("");
  const [insuranceUnits, setInsuranceUnits] = useState("1");
  const [extraUnits, setExtraUnits] = useState("1");
  const [selectedExtras, setSelectedExtras] = useState<AddedLine[]>([]);
  const [fuelAmount, setFuelAmount] = useState("");
  const [discountMode, setDiscountMode] = useState<0 | 5 | 10 | 15 | 20 | "OTRO">(0);
  const [customDiscountPercent, setCustomDiscountPercent] = useState("");
  const [budgetEmail, setBudgetEmail] = useState("");
  const [sendFeedback, setSendFeedback] = useState("");
  const [isSendingBudget, setIsSendingBudget] = useState(false);

  const billedDays = useMemo(() => computeBilledDaysBy24h(deliveryAt, pickupAt, courtesyHours), [courtesyHours, deliveryAt, pickupAt]);
  const selectedPlan = useMemo(() => tariffCatalogs.find((item) => item.plan.id === selectedTariffPlanId) ?? null, [selectedTariffPlanId, tariffCatalogs]);
  const plansForCode = useMemo(() => {
    if (!selectedPlan) return [];
    return tariffCatalogs.filter((item) => item.plan.code.trim().toUpperCase() === selectedPlan.plan.code.trim().toUpperCase());
  }, [selectedPlan, tariffCatalogs]);
  const quote = useMemo(() => {
    if (!selectedPlan || !selectedGroup || !deliveryAt || !pickupAt) {
      return { found: false, amount: 0, bracketLabel: "", segmentPlanIds: [] as string[] };
    }
    return calculateTariffAmountFromPlans({
      plans: plansForCode,
      preferredPlanId: selectedPlan.plan.id,
      groupCode: selectedGroup,
      billedDays,
      deliveryAt,
      pickupAt,
    });
  }, [billedDays, deliveryAt, pickupAt, plansForCode, selectedGroup, selectedPlan]);

  const crossedSeasonPlans = useMemo(
    () =>
      quote.segmentPlanIds
        .map((planId) => tariffCatalogs.find((item) => item.plan.id === planId) ?? null)
        .filter((item): item is TariffCatalog => item !== null),
    [quote.segmentPlanIds, tariffCatalogs],
  );

  const discountPercent = discountMode === "OTRO" ? Math.max(0, parseNumberInput(customDiscountPercent)) : discountMode;
  const baseAmount = quote.found ? quote.amount : 0;
  const appliedRateCode = quote.found ? (quote.segmentPlanIds.length > 1 ? "TXT" : (selectedPlan?.plan.code ?? "")) : "";
  const selectedInsuranceLine = buildLine(insuranceOptions.find((item) => item.id === selectedInsuranceId) ?? null, insuranceUnits, billedDays);
  const insuranceAmount = selectedInsuranceLine?.amount ?? 0;
  const extrasAmount = useMemo(() => selectedExtras.reduce((sum, item) => sum + item.amount, 0), [selectedExtras]);
  const fuelAmountNumber = parseNumberInput(fuelAmount);
  const discountAmount = Number(((baseAmount * discountPercent) / 100).toFixed(2));
  const total = baseAmount - discountAmount + insuranceAmount + extrasAmount + fuelAmountNumber;
  const extrasBreakdown = useMemo(() => buildExtrasBreakdown(selectedExtras), [selectedExtras]);
  const renderedPreviewHtml = useMemo(() => {
    const language = (previewLanguage || "es").trim().toLowerCase();
    const templateHtml = (previewTemplateHtml || "").trim() || getBudgetBaseTemplate(language);
    return renderTemplateWithMacros(
      templateHtml,
      buildBudgetTemplateData({
        language,
        company: previewCompany,
        budget: {
          deliveryAt,
          deliveryPlace: "",
          pickupAt,
          pickupPlace: "",
          billedCarGroup: selectedGroup,
          billedDays,
          appliedRate: appliedRateCode,
          baseAmount,
          discountAmount,
          insuranceAmount,
          extrasAmount,
          fuelAmount: fuelAmountNumber,
          totalAmount: total,
          extrasBreakdown,
        },
      }),
    );
  }, [
    appliedRateCode,
    baseAmount,
    billedDays,
    deliveryAt,
    discountAmount,
    extrasAmount,
    extrasBreakdown,
    fuelAmountNumber,
    insuranceAmount,
    pickupAt,
    previewCompany,
    previewLanguage,
    previewTemplateHtml,
    selectedGroup,
    total,
  ]);

  async function handleSendBudgetEmail() {
    const toEmail = budgetEmail.trim();
    if (!canWrite) {
      setSendFeedback("No tienes permiso para enviar presupuestos.");
      return;
    }
    if (!toEmail) {
      setSendFeedback("Introduce un email destino.");
      return;
    }
    if (!quote.found) {
      setSendFeedback("Calcula un presupuesto valido antes de enviarlo.");
      return;
    }
    setIsSendingBudget(true);
    setSendFeedback("");
    startTransition(async () => {
      try {
        await sendBudgetEmailAction({
          toEmail,
          language: "es",
          deliveryAt,
          deliveryPlace: "",
          pickupAt,
          pickupPlace: "",
          billedCarGroup: selectedGroup,
          billedDays,
          appliedRate: appliedRateCode,
          baseAmount,
          discountAmount,
          insuranceAmount,
          extrasAmount,
          fuelAmount: fuelAmountNumber,
          totalAmount: total,
          extrasBreakdown,
        });
        setSendFeedback("Presupuesto enviado.");
      } catch (error) {
        setSendFeedback(error instanceof Error ? error.message : "Error al enviar presupuesto.");
      } finally {
        setIsSendingBudget(false);
      }
    });
  }

  return (
    <section className="card stack-md">
      <div className="stack-sm">
        <h3>Presupuestos</h3>
      </div>

      <div className="stack-md">
          <section className="card-muted stack-sm">
            <h4>Datos base</h4>
            <div className="form-grid">
              <label>
                Entrega
                <input type="datetime-local" value={deliveryAt} onChange={(event) => setDeliveryAt(event.target.value)} />
              </label>
              <label>
                Recogida
                <input type="datetime-local" value={pickupAt} onChange={(event) => setPickupAt(event.target.value)} />
              </label>
              <label>
                Tarifa
                <select value={selectedTariffPlanId} onChange={(event) => setSelectedTariffPlanId(event.target.value)}>
                  <option value="">Selecciona</option>
                  {tariffCatalogs.map((catalog) => (
                    <option key={catalog.plan.id} value={catalog.plan.id}>
                      {catalog.plan.code} - {catalog.plan.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Grupo
                <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
                  <option value="">Selecciona</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tarifa aplicada
                <input value={appliedRateCode} readOnly />
              </label>
            </div>
            {selectedPlan ? (
              <div className="budget-note-box">
                <p>
                  <strong>Tarifa:</strong> {selectedPlan.plan.title} ({formatDateDisplay(selectedPlan.plan.validFrom)} - {formatDateDisplay(selectedPlan.plan.validTo)})
                </p>
                {crossedSeasonPlans.length > 1 ? (
                  <p>
                    <strong>Cruce de temporadas:</strong>{" "}
                    {crossedSeasonPlans.map((item) => `${item.plan.title} (${formatDateDisplay(item.plan.validFrom)} - ${formatDateDisplay(item.plan.validTo)})`).join(" + ")}
                  </p>
                ) : quote.bracketLabel ? (
                  <p>
                    <strong>Tramo:</strong> {quote.bracketLabel}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card-muted stack-sm">
            <h4>Conceptos</h4>
            <div className="form-grid">
              <div className="budget-concept-grid col-span-2">
                <label className="extras-inline-main budget-concept-main">
                  Seguro
                  <select value={selectedInsuranceId} onChange={(event) => setSelectedInsuranceId(event.target.value)}>
                    <option value="">Selecciona</option>
                    {insuranceOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} - {item.name} ({item.priceMode === "POR_DIA" ? "día" : "fijo"}) {formatMoney(item.unitPrice)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Unidades
                  <input type="number" min="1" value={insuranceUnits} onChange={(event) => setInsuranceUnits(event.target.value)} />
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Tipo
                  <input value={selectedInsuranceId ? (insuranceOptions.find((item) => item.id === selectedInsuranceId)?.priceMode === "POR_DIA" ? "Por día" : "Fijo") : ""} readOnly />
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Precio
                  <input value={selectedInsuranceId ? formatMoney(insuranceOptions.find((item) => item.id === selectedInsuranceId)?.unitPrice ?? 0) : ""} readOnly />
                </label>
                <label className="extras-inline-mini budget-concept-total">
                  Total
                  <input value={selectedInsuranceId ? formatMoney(selectedInsuranceLine?.amount ?? 0) : ""} readOnly />
                </label>
              </div>

              <div className="budget-concept-grid col-span-2">
                <label className="extras-inline-main budget-concept-main">
                  Extra
                  <select value={selectedExtraId} onChange={(event) => setSelectedExtraId(event.target.value)}>
                    <option value="">Selecciona</option>
                    {extraOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} - {item.name} ({item.priceMode === "POR_DIA" ? "día" : "fijo"}) {formatMoney(item.unitPrice)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Unidades
                  <input type="number" min="1" value={extraUnits} onChange={(event) => setExtraUnits(event.target.value)} />
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Tipo
                  <input value={selectedExtraId ? (extraOptions.find((item) => item.id === selectedExtraId)?.priceMode === "POR_DIA" ? "Por día" : "Fijo") : ""} readOnly />
                </label>
                <label className="extras-inline-mini budget-concept-meta">
                  Precio
                  <input value={selectedExtraId ? formatMoney(extraOptions.find((item) => item.id === selectedExtraId)?.unitPrice ?? 0) : ""} readOnly />
                </label>
                <label className="extras-inline-mini budget-concept-total">
                  Total
                  <input value={selectedExtraId ? formatMoney(buildLine(extraOptions.find((item) => item.id === selectedExtraId) ?? null, extraUnits, billedDays)?.amount ?? 0) : ""} readOnly />
                </label>
              </div>
              <div className="col-span-2">
                <button
                  type="button"
                  className="secondary-btn budget-add-btn"
                  disabled={!selectedExtraId}
                  onClick={() => {
                    const line = buildLine(extraOptions.find((item) => item.id === selectedExtraId) ?? null, extraUnits, billedDays);
                    if (!line) return;
                    setSelectedExtras((current) => [...current, line]);
                  }}
                >
                  Añadir extra
                </button>
              </div>
            </div>

            <div className="budget-bottom-grid">
              <div className="stack-sm">
                <label className="budget-fuel-field">
                  Combustible
                  <input type="number" min="0" step="0.01" value={fuelAmount} onChange={(event) => setFuelAmount(event.target.value)} placeholder="Importe manual" />
                </label>
              </div>

              <div className="budget-table-grid">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Seguros</th>
                        <th>Tipo</th>
                        <th>Importe</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedInsuranceLine ? (
                        <tr><td colSpan={4} className="muted-text">Sin seguros añadidos.</td></tr>
                      ) : (
                        <tr>
                          <td>{selectedInsuranceLine.code} - {selectedInsuranceLine.name}</td>
                          <td>{selectedInsuranceLine.priceMode === "POR_DIA" ? `Por día x${selectedInsuranceLine.units}` : `Fijo x${selectedInsuranceLine.units}`}</td>
                          <td>{formatMoney(selectedInsuranceLine.amount)}</td>
                          <td><button type="button" className="secondary-btn budget-row-action" onClick={() => setSelectedInsuranceId("")}>Quitar</button></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Extras</th>
                        <th>Tipo</th>
                        <th>Importe</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedExtras.length === 0 ? (
                        <tr><td colSpan={4} className="muted-text">Sin extras añadidos.</td></tr>
                      ) : (
                        selectedExtras.map((item, index) => (
                          <tr key={`${item.id}-${index}`}>
                            <td>{item.code} - {item.name}</td>
                            <td>{item.priceMode === "POR_DIA" ? `Por día x${item.units}` : `Fijo x${item.units}`}</td>
                            <td>{formatMoney(item.amount)}</td>
                            <td><button type="button" className="secondary-btn budget-row-action" onClick={() => setSelectedExtras((current) => current.filter((_, idx) => idx !== index))}>Quitar</button></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <section className="card-muted budget-discount-card budget-discount-card-full">
              <h4>Descuento</h4>
              <div className="budget-discount-pills">
                {[0, 5, 10, 15, 20].map((value) => (
                  <button key={value} type="button" className={discountMode === value ? "primary-btn" : "secondary-btn"} onClick={() => setDiscountMode(value)}>
                    {value}%
                  </button>
                ))}
                <div className="budget-discount-other">
                  {discountMode === "OTRO" ? (
                    <label className="budget-discount-other-input">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        step="0.01"
                        value={customDiscountPercent}
                        onChange={(event) => setCustomDiscountPercent(event.target.value)}
                        placeholder="% manual"
                      />
                    </label>
                  ) : (
                    <button type="button" className="secondary-btn" onClick={() => setDiscountMode("OTRO")}>
                      Otro
                    </button>
                  )}
                </div>
              </div>
            </section>
          </section>

          <section className="budget-summary-card">
            <div className="budget-summary-head">
              <div>
                <h4>Resumen</h4>
              </div>
            </div>

            <div className="budget-summary-grid">
              <div className="budget-summary-item">
                <span>Días facturados</span>
                <strong>{String(billedDays)}</strong>
              </div>
              <div className="budget-summary-item">
                <span>Alquiler</span>
                <strong>{formatMoney(baseAmount)}</strong>
              </div>
              <div className="budget-summary-item">
                <span>Descuento</span>
                <strong>{formatMoney(discountAmount)}</strong>
              </div>
              <div className="budget-summary-item">
                <span>Seguros</span>
                <strong>{formatMoney(insuranceAmount)}</strong>
              </div>
              <div className="budget-summary-item">
                <span>Extras</span>
                <strong>{formatMoney(extrasAmount)}</strong>
              </div>
              <div className="budget-summary-item">
                <span>Combustible</span>
                <strong>{formatMoney(fuelAmountNumber)}</strong>
              </div>
            </div>

            <div className="budget-summary-total budget-summary-total-inline">
              <span>Total presupuesto</span>
              <strong>{formatMoney(total)}</strong>
            </div>

            <div className="budget-send-row">
              <label className="budget-send-field">
                <input
                  type="email"
                  value={budgetEmail}
                  onChange={(event) => setBudgetEmail(event.target.value)}
                  placeholder="cliente@correo.com"
                />
              </label>
              <button type="button" className="primary-btn budget-send-btn" onClick={handleSendBudgetEmail} disabled={!canWrite || isSendingBudget}>
                {isSendingBudget ? "Enviando..." : "Enviar presupuesto"}
              </button>
            </div>
            {sendFeedback ? <p className={`muted-text ${sendFeedback === "Presupuesto enviado." ? "" : "danger-text"}`}>{sendFeedback}</p> : null}
          </section>

          <section className="card-muted stack-sm">
            <div className="budget-summary-head">
              <div>
                <h4>Vista previa</h4>
                <p className="muted-text">Usa la plantilla activa de presupuesto.</p>
              </div>
            </div>
            <div className="html-preview" dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }} />
          </section>
      </div>
    </section>
  );
}
