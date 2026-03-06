"use client";
// Módulo contract-create-form.tsx.

import { useMemo, useState } from "react";

type ClientLite = {
  id: string;
  clientCode: string;
  clientType: "PARTICULAR" | "EMPRESA" | "COMISIONISTA";
  firstName: string;
  lastName: string;
  companyName: string;
  commissionerName: string;
  acquisitionChannel: string;
};

type Props = {
  action: (formData: FormData) => void;
  canWrite: boolean;
  clients: ClientLite[];
  vehicles: Array<{ plate: string; groupLabel: string }>;
  tariffOptions: Array<{ id: string; code: string; title: string }>;
  salesChannels: string[];
  extraOptions: Array<{
    id: string;
    code: string;
    name: string;
    priceMode: "FIJO" | "POR_DIA";
    unitPrice: number;
    maxDays: number;
  }>;
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
    fuelPolicy?: string;
    baseAmount?: string;
    discountAmount?: string;
    extrasAmount?: string;
    fuelAmount?: string;
    insuranceAmount?: string;
    penaltiesAmount?: string;
    extrasBreakdown?: string;
    additionalDrivers?: string;
  };
};

function clientDisplayName(client: ClientLite): string {
  const personal = `${client.firstName} ${client.lastName}`.trim();
  if (personal) return personal;
  if (client.companyName) return client.companyName;
  if (client.commissionerName) return client.commissionerName;
  return client.clientCode;
}

function parseNumberInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAdditionalDrivers(value: string): { name: string; license: string } {
  const normalized = value.trim();
  if (!normalized) return { name: "", license: "" };
  const nameMatch = normalized.match(/Nombre:\s*([^|]+)/i);
  const licenseMatch = normalized.match(/Carnet:\s*(.+)$/i);
  return {
    name: (nameMatch?.[1] ?? "").trim(),
    license: (licenseMatch?.[1] ?? "").trim(),
  };
}

export function ContractCreateForm({
  action,
  canWrite,
  clients,
  vehicles = [],
  tariffOptions = [],
  salesChannels = [],
  extraOptions = [],
  initialValues,
}: Props) {
  const [activeBottomTab, setActiveBottomTab] = useState<"notas-publicas" | "notas-privadas" | "extras" | "conductores">(
    "notas-publicas",
  );
  const [lookup, setLookup] = useState(String(initialValues?.lookup ?? ""));
  const [customerId, setCustomerId] = useState(String(initialValues?.customerId ?? ""));
  const [customerName, setCustomerName] = useState(String(initialValues?.customerName ?? ""));
  const [customerCompany, setCustomerCompany] = useState(String(initialValues?.customerCompany ?? ""));
  const [customerCommissioner, setCustomerCommissioner] = useState(String(initialValues?.customerCommissioner ?? ""));
  const [salesChannel, setSalesChannel] = useState(String(initialValues?.salesChannel ?? ""));
  const [assignedPlate, setAssignedPlate] = useState(String(initialValues?.assignedPlate ?? ""));
  const [assignedVehicleGroup, setAssignedVehicleGroup] = useState(String(initialValues?.assignedVehicleGroup ?? ""));
  const [baseAmount, setBaseAmount] = useState(String(initialValues?.baseAmount ?? "0"));
  const [discountAmount, setDiscountAmount] = useState(String(initialValues?.discountAmount ?? "0"));
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
  const [extrasAmount, setExtrasAmount] = useState(String(initialValues?.extrasAmount ?? "0"));
  const [fuelAmount, setFuelAmount] = useState(String(initialValues?.fuelAmount ?? "0"));
  const [insuranceAmount, setInsuranceAmount] = useState(String(initialValues?.insuranceAmount ?? "0"));
  const [penaltiesAmount, setPenaltiesAmount] = useState(String(initialValues?.penaltiesAmount ?? "0"));
  const parsedAdditionalDrivers = parseAdditionalDrivers(String(initialValues?.additionalDrivers ?? ""));
  const [additionalDriverName, setAdditionalDriverName] = useState(parsedAdditionalDrivers.name);
  const [additionalDriverLicense, setAdditionalDriverLicense] = useState(parsedAdditionalDrivers.license);
  const [priceLocked, setPriceLocked] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityGroup, setAvailabilityGroup] = useState("");
  const [availabilityPlate, setAvailabilityPlate] = useState("");

  const extrasAmountComputed = useMemo(() => selectedExtras.reduce((sum, item) => sum + item.amount, 0), [selectedExtras]);
  const legacyExtrasAmount = parseNumberInput(extrasAmount);
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
  }, [selectedExtras, legacyExtrasAmount]);
  const extrasBreakdown = useMemo(
    () =>
      visibleExtras.length === 0
        ? (initialValues?.extrasBreakdown ?? "")
        : visibleExtras
            .map((item) => `${item.code}:${item.name} x${item.units} (${item.priceMode === "POR_DIA" ? "día" : "fijo"}) = ${item.amount.toFixed(2)}`)
            .join(" | "),
    [visibleExtras, initialValues?.extrasBreakdown],
  );
  const additionalDriversPayload = useMemo(() => {
    const name = additionalDriverName.trim();
    const license = additionalDriverLicense.trim();
    if (!name && !license) return "";
    return `Nombre: ${name} | Carnet: ${license}`;
  }, [additionalDriverLicense, additionalDriverName]);
  const groupOptions = useMemo(
    () => Array.from(new Set(vehicles.map((vehicle) => vehicle.groupLabel).filter(Boolean))).toSorted((a, b) => a.localeCompare(b)),
    [vehicles],
  );
  const groupPlates = useMemo(
    () =>
      vehicles
        .filter((vehicle) => vehicle.groupLabel === availabilityGroup)
        .map((vehicle) => vehicle.plate)
        .toSorted((a, b) => a.localeCompare(b)),
    [availabilityGroup, vehicles],
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
  const selectedExtraOption = useMemo(
    () => extraOptions.find((item) => item.id === selectedExtraId) ?? null,
    [extraOptions, selectedExtraId],
  );
  const selectedExtraUnits = useMemo(() => {
    if (!selectedExtraOption) return 0;
    const rawUnits = Math.max(1, parseNumberInput(extraUnitsInput));
    return selectedExtraOption.priceMode === "POR_DIA" && selectedExtraOption.maxDays > 0
      ? Math.min(rawUnits, selectedExtraOption.maxDays)
      : rawUnits;
  }, [extraUnitsInput, selectedExtraOption]);
  const selectedExtraUnitPrice = selectedExtraOption ? selectedExtraOption.unitPrice.toFixed(2) : "";
  const selectedExtraTotalPrice = selectedExtraOption
    ? (selectedExtraOption.priceMode === "POR_DIA" ? selectedExtraOption.unitPrice * selectedExtraUnits : selectedExtraOption.unitPrice).toFixed(2)
    : "";

  const matches = useMemo(() => {
    const q = lookup.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((client) =>
        [client.id, client.clientCode, clientDisplayName(client), client.companyName, client.commissionerName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [lookup, clients]);

  function fillClient(client: ClientLite) {
    const name = clientDisplayName(client);
    setCustomerId(client.id);
    setCustomerName(name);
    setCustomerCompany(String(client.companyName ?? ""));
    setCustomerCommissioner(String(client.commissionerName ?? ""));
    setSalesChannel(String(client.acquisitionChannel ?? ""));
    setLookup(`${name} (${client.clientCode})`);
  }

  function autoFillFromCustomerId(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const found =
      clients.find((client) => client.id === value) ??
      clients.find((client) => client.clientCode.trim().toUpperCase() === value.toUpperCase()) ??
      null;
    if (found) fillClient(found);
  }

  function autoFillFromCustomerName(rawValue: string) {
    const value = rawValue.trim().toLowerCase();
    if (!value) return;
    const exact = clients.find((client) => clientDisplayName(client).trim().toLowerCase() === value);
    const startsWith = clients.find((client) => clientDisplayName(client).trim().toLowerCase().startsWith(value));
    const found = exact ?? startsWith ?? null;
    if (found) fillClient(found);
  }

  function handleAssignedPlateChange(nextPlate: string) {
    setAssignedPlate(nextPlate);
    const found = vehicles.find((vehicle) => vehicle.plate.toUpperCase() === nextPlate.trim().toUpperCase());
    setAssignedVehicleGroup(found?.groupLabel || "");
  }

  const total = useMemo(() => {
    return (
      parseNumberInput(baseAmount) -
      parseNumberInput(discountAmount) +
      (selectedExtras.length > 0 ? extrasAmountComputed : legacyExtrasAmount) +
      parseNumberInput(fuelAmount) +
      parseNumberInput(insuranceAmount) +
      parseNumberInput(penaltiesAmount)
    );
  }, [baseAmount, discountAmount, selectedExtras, extrasAmountComputed, legacyExtrasAmount, fuelAmount, insuranceAmount, penaltiesAmount]);

  function addExtraLine() {
    const extra = extraOptions.find((item) => item.id === selectedExtraId);
    if (!extra) return;
    const rawUnits = Math.max(1, parseNumberInput(extraUnitsInput));
    const units = extra.priceMode === "POR_DIA" && extra.maxDays > 0 ? Math.min(rawUnits, extra.maxDays) : rawUnits;
    const amount = extra.priceMode === "POR_DIA" ? extra.unitPrice * units : extra.unitPrice;
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
              <input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Nombre, código o ID" disabled={!canWrite} />
            </label>
            {matches.length > 0 ? (
              <div className="col-span-2 quick-pick-list">
                {matches.map((client) => (
                  <button key={client.id} type="button" className="quick-pick-item" onClick={() => fillClient(client)} disabled={!canWrite}>
                    {clientDisplayName(client)} · {client.clientCode}
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
              <input name="branchDelivery" defaultValue={initialValues?.branchDelivery ?? ""} required disabled={!canWrite} />
            </label>
            <label>
              Lugar entrega
              <input name="deliveryPlace" defaultValue={initialValues?.deliveryPlace ?? ""} disabled={!canWrite} />
            </label>
            <label>
              Fecha/hora entrega *
              <input name="deliveryAt" type="datetime-local" defaultValue={initialValues?.deliveryAt ?? ""} required disabled={!canWrite} />
            </label>
            <label>
              Sucursal recogida
              <input name="pickupBranch" defaultValue={initialValues?.pickupBranch ?? ""} disabled={!canWrite} />
            </label>
            <label>
              Lugar recogida
              <input name="pickupPlace" defaultValue={initialValues?.pickupPlace ?? ""} disabled={!canWrite} />
            </label>
            <label>
              Fecha/hora recogida *
              <input name="pickupAt" type="datetime-local" defaultValue={initialValues?.pickupAt ?? ""} required disabled={!canWrite} />
            </label>
            <label>
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
            <label>
              Grupo reservado *
              <input name="billedCarGroup" defaultValue={initialValues?.billedCarGroup ?? ""} required disabled={!canWrite} />
            </label>
            <label>
              Matrícula
              <input
                name="assignedPlate"
                value={assignedPlate}
                onChange={(event) => handleAssignedPlateChange(event.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label>
              Grupo entregado
              <input name="assignedVehicleGroup" value={assignedVehicleGroup} readOnly />
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
        </section>

        </div>

        <aside className="price-side-card">
          <h4>Liquidación</h4>
          <label>
            Días facturados
            <input name="billedDays" type="number" min={1} defaultValue={initialValues?.billedDays ?? "1"} disabled={!canWrite} />
          </label>
          <label>
            Tarifa
            <select name="appliedRate" defaultValue={initialValues?.appliedRate ?? ""} disabled={!canWrite}>
              <option value="">Sin tarifa</option>
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
            <input name="baseAmount" type="number" step="0.01" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Descuento
            <input
              name="discountAmount"
              type="number"
              step="0.01"
              value={discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <label>
            Combustible
            <input name="fuelAmount" type="number" step="0.01" value={fuelAmount} onChange={(event) => setFuelAmount(event.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Extras
            <input
              name="extrasAmountPreview"
              type="number"
              step="0.01"
              value={(selectedExtras.length > 0 ? extrasAmountComputed : legacyExtrasAmount).toFixed(2)}
              readOnly
            />
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
            <input
              name="insuranceAmount"
              type="number"
              step="0.01"
              value={insuranceAmount}
              onChange={(event) => setInsuranceAmount(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <label>
            Extension
            <input
              name="penaltiesAmount"
              type="number"
              step="0.01"
              value={penaltiesAmount}
              onChange={(event) => setPenaltiesAmount(event.target.value)}
              disabled={!canWrite}
            />
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
            <textarea className="col-span-2" name="publicNotes" rows={3} disabled={!canWrite} />
          </div>
        ) : null}

        {activeBottomTab === "notas-privadas" ? (
          <div className="form-grid">
            <textarea className="col-span-2" name="privateNotes" rows={3} disabled={!canWrite} />
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
          </div>
        ) : null}

        {activeBottomTab === "conductores" ? (
          <div className="form-grid">
            <label>
              Nombre
              <input value={additionalDriverName} onChange={(event) => setAdditionalDriverName(event.target.value)} disabled={!canWrite} />
            </label>
            <label>
              Carnet de conducir
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
              setLookup("");
              setCustomerId("");
              setCustomerName("");
              setCustomerCompany("");
              setCustomerCommissioner("");
              setSalesChannel("");
              setAssignedPlate("");
              setAssignedVehicleGroup("");
              setBaseAmount("0");
              setDiscountAmount("0");
              setSelectedExtraId(extraOptions[0]?.id ?? "");
              setExtraUnitsInput("1");
              setSelectedExtras([]);
              setExtrasAmount("0");
              setFuelAmount("0");
              setInsuranceAmount("0");
              setPenaltiesAmount("0");
              setAdditionalDriverName("");
              setAdditionalDriverLicense("");
              setPriceLocked(false);
              setShowAvailability(false);
              setAvailabilityGroup("");
              setAvailabilityPlate("");
            }}
          >
            Limpiar campos
          </button>
          <button
            className={priceLocked ? "primary-btn" : "secondary-btn"}
            type="button"
            onClick={() => setPriceLocked((current) => !current)}
            disabled={!canWrite}
          >
            {priceLocked ? "Precios bloqueados" : "Bloquear precios"}
          </button>
          <button className="secondary-btn" type="button" onClick={() => setShowAvailability((current) => !current)}>
            Disponibilidad
          </button>
          <a className="secondary-btn text-center" href="/contratos?tab=historico">
            Auditoría
          </a>
        </div>

        {showAvailability ? (
          <div className="form-grid">
            <label>
              Grupo
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
                  if (plate) {
                    handleAssignedPlateChange(plate);
                  }
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
      <input type="hidden" name="extrasBreakdown" value={extrasBreakdown} readOnly />
      <input type="hidden" name="extrasAmount" value={(selectedExtras.length > 0 ? extrasAmountComputed : legacyExtrasAmount).toFixed(2)} readOnly />
      <input type="hidden" name="totalPrice" value={total.toFixed(2)} readOnly />
      <input type="hidden" name="additionalDrivers" value={additionalDriversPayload} readOnly />
      <input type="hidden" name="publicObservations" value="" readOnly />
      <input type="hidden" name="privateObservations" value="" readOnly />
    </form>
  );
}
