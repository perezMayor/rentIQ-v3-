"use client";
// Módulo reservation-form.tsx.

import { useMemo, useState } from "react";

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

type Props = {
  action: (formData: FormData) => void;
  canWrite: boolean;
  initialClient: ClientLite | null;
  tariffOptions: Array<{ id: string; code: string; title: string }>;
  clients: ClientLite[];
  vehicles: Array<{ plate: string; groupLabel: string }>;
  salesChannels: string[];
  extraOptions: Array<{
    id: string;
    code: string;
    name: string;
    priceMode: "FIJO" | "POR_DIA";
    unitPrice: number;
    maxDays: number;
  }>;
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

export function ReservationForm({ action, canWrite, initialClient, tariffOptions, clients, vehicles, salesChannels, extraOptions }: Props) {
  const [activeBottomTab, setActiveBottomTab] = useState<"notas-publicas" | "notas-privadas" | "extras" | "conductores">(
    "notas-publicas",
  );
  const initialName = initialClient ? clientDisplayName(initialClient) : "";
  const [clientLookup, setClientLookup] = useState("");
  const [customerId, setCustomerId] = useState(String(initialClient?.id ?? ""));
  const [customerName, setCustomerName] = useState(initialName);
  const [customerCompany, setCustomerCompany] = useState(String(initialClient?.companyName ?? ""));
  const [customerCommissioner, setCustomerCommissioner] = useState(String(initialClient?.commissionerName ?? ""));
  const [salesChannel, setSalesChannel] = useState(String(initialClient?.acquisitionChannel ?? ""));
  const [billedCarGroup, setBilledCarGroup] = useState("");
  const [assignedPlate, setAssignedPlate] = useState("");
  const [assignedVehicleGroup, setAssignedVehicleGroup] = useState("");
  const [priceLocked, setPriceLocked] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityGroup, setAvailabilityGroup] = useState("");
  const [availabilityPlate, setAvailabilityPlate] = useState("");
  const [priceRecalcHint, setPriceRecalcHint] = useState("");

  const [baseAmount, setBaseAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
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
  const [fuelAmount, setFuelAmount] = useState("0");
  const [insuranceAmount, setInsuranceAmount] = useState("0");
  const [penaltiesAmount, setPenaltiesAmount] = useState("0");
  const [additionalDriverName, setAdditionalDriverName] = useState("");
  const [additionalDriverLicense, setAdditionalDriverLicense] = useState("");

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

  const total = useMemo(() => {
    return (
      parseNumberInput(baseAmount) -
      parseNumberInput(discountAmount) +
      selectedExtras.reduce((sum, item) => sum + item.amount, 0) +
      parseNumberInput(fuelAmount) +
      parseNumberInput(insuranceAmount) +
      parseNumberInput(penaltiesAmount)
    );
  }, [baseAmount, discountAmount, selectedExtras, fuelAmount, insuranceAmount, penaltiesAmount]);

  const extrasAmount = useMemo(() => selectedExtras.reduce((sum, item) => sum + item.amount, 0), [selectedExtras]);
  const additionalDriversPayload = useMemo(() => {
    const name = additionalDriverName.trim();
    const license = additionalDriverLicense.trim();
    if (!name && !license) return "";
    return `Nombre: ${name} | Carnet: ${license}`;
  }, [additionalDriverLicense, additionalDriverName]);
  const extrasBreakdown = useMemo(
    () =>
      selectedExtras.length === 0
        ? ""
        : selectedExtras
            .map((item) => `${item.code}:${item.name} x${item.units} (${item.priceMode === "POR_DIA" ? "día" : "fijo"}) = ${item.amount.toFixed(2)}`)
            .join(" | "),
    [selectedExtras],
  );
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

  function fillFromClient(client: ClientLite) {
    const name = clientDisplayName(client);
    setCustomerId(client.id);
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
      clients.find((client) => client.id === value) ??
      clients.find((client) => client.clientCode.trim().toUpperCase() === value.toUpperCase()) ??
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

  function handleBilledGroupChange(nextGroup: string) {
    const previousGroup = billedCarGroup.trim().toUpperCase();
    const normalizedNext = nextGroup.trim().toUpperCase();
    const changed = previousGroup !== "" && normalizedNext !== "" && previousGroup !== normalizedNext;
    setBilledCarGroup(nextGroup);
    if (priceLocked || !changed) return;
    const shouldRecalculate = window.confirm(
      "Has cambiado el grupo. ¿Quieres actualizar al precio del nuevo grupo?",
    );
    if (shouldRecalculate) {
      setBaseAmount("0");
      setPriceRecalcHint("El precio del alquiler se recalculará al guardar la reserva.");
    } else {
      setPriceRecalcHint("");
    }
  }

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
                <input
                  value={clientLookup}
                  onChange={(event) => setClientLookup(event.target.value)}
                  placeholder="Nombre, documento, email, teléfono o código"
                  disabled={!canWrite}
                />
              </label>
              {initialClient ? <p className="col-span-2 muted-text">Cliente precargado: {initialName}</p> : null}
              {lookupMatches.length > 0 ? (
                <div className="col-span-2 quick-pick-list">
                  {lookupMatches.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="quick-pick-item"
                      onClick={() => fillFromClient(client)}
                      disabled={!canWrite}
                    >
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
                  onChange={(e) => setCustomerId(e.target.value)}
                  onBlur={(e) => autoFillFromCustomerId(e.target.value)}
                  disabled={!canWrite}
                />
              </label>
              <label>
                Cliente *
                <input
                  name="customerName"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onBlur={(e) => autoFillFromCustomerName(e.target.value)}
                  disabled={!canWrite}
                />
              </label>
              <label>
                Empresa
                <select name="customerCompany" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} disabled={!canWrite}>
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
                <select name="customerCommissioner" value={customerCommissioner} onChange={(e) => setCustomerCommissioner(e.target.value)} disabled={!canWrite}>
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
            <h4>2) Entrega y recogida</h4>
            <div className="form-grid">
              <label>
                Sucursal entrega *
                <input name="branchDelivery" required disabled={!canWrite} />
              </label>
              <label>
                Lugar entrega
                <input name="deliveryPlace" disabled={!canWrite} />
              </label>
              <label>
                Fecha/hora entrega *
                <input name="deliveryAt" type="datetime-local" required disabled={!canWrite} />
              </label>
              <label>
                Vuelo entrega
                <input name="deliveryFlightNumber" disabled={!canWrite} />
              </label>
              <label>
                Sucursal recogida
                <input name="pickupBranch" disabled={!canWrite} />
              </label>
              <label>
                Lugar recogida
                <input name="pickupPlace" disabled={!canWrite} />
              </label>
              <label>
                Fecha/hora recogida *
                <input name="pickupAt" type="datetime-local" required disabled={!canWrite} />
              </label>
              <label>
                Vuelo recogida
                <input name="pickupFlightNumber" disabled={!canWrite} />
              </label>
              <label>
                Canal de venta
                <select name="salesChannel" value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} disabled={!canWrite}>
                  <option value="">Sin canal</option>
                  {salesChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Estado
                <select name="reservationStatus" defaultValue="CONFIRMADA" disabled={!canWrite}>
                  <option value="CONFIRMADA">Confirmada</option>
                  <option value="PETICION">Petición</option>
                </select>
              </label>
            </div>
          </section>

          <section className="card-muted stack-sm">
            <h4>3) Vehículo</h4>
            <div className="form-grid">
              <label>
                Grupo reservado *
                <input name="billedCarGroup" required value={billedCarGroup} onChange={(e) => handleBilledGroupChange(e.target.value)} disabled={!canWrite} />
              </label>
              <label>
                Matrícula (manual)
                <input name="assignedPlate" value={assignedPlate} onChange={(e) => handleAssignedPlateChange(e.target.value)} disabled={!canWrite} />
              </label>
              <label>
                Grupo entregado
                <input name="assignedVehicleGroup" value={assignedVehicleGroup} readOnly />
              </label>
              <label>
                Bloquear matrícula para esta reserva
                <select name="blockPlateForReservation" defaultValue="false" disabled={!canWrite}>
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </label>
            </div>
            {priceRecalcHint ? <p className="muted-text">{priceRecalcHint}</p> : null}
          </section>
        </div>

        <aside className="price-side-card">
          <h4>Liquidación</h4>
          <label>
            Días facturados
            <input name="billedDays" type="number" min={1} defaultValue="1" disabled={!canWrite} />
          </label>
          <label>
            Tarifa
            <select name="appliedRate" disabled={!canWrite}>
              <option value="">Sin tarifa</option>
              {tariffOptions.map((option) => (
                <option key={option.id} value={option.code}>
                  {option.code} - {option.title}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="ivaPercent" value="21" readOnly />
          <label>
            Alquiler
            <input name="baseAmount" type="number" step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Descuento
            <input name="discountAmount" type="number" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Combustible
            <input name="fuelAmount" type="number" step="0.01" value={fuelAmount} onChange={(e) => setFuelAmount(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Extras
            <input name="extrasAmountPreview" type="number" step="0.01" value={extrasAmount.toFixed(2)} readOnly />
          </label>
          <label>
            Franquicia
            <input name="deductible" disabled={!canWrite} />
          </label>
          <label>
            Fianza
            <input name="depositAmount" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
          </label>
          <label>
            CDW
            <input name="insuranceAmount" type="number" step="0.01" value={insuranceAmount} onChange={(e) => setInsuranceAmount(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Extension
            <input name="penaltiesAmount" type="number" step="0.01" value={penaltiesAmount} onChange={(e) => setPenaltiesAmount(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Pagos realizados
            <input name="paymentsMade" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
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
                  <select value={selectedExtraId} onChange={(e) => setSelectedExtraId(e.target.value)} disabled={!canWrite}>
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
                  <input value={extraUnitsInput} onChange={(e) => setExtraUnitsInput(e.target.value)} type="number" min={1} disabled={!canWrite} />
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
              {selectedExtras.length > 0 ? (
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
                      {selectedExtras.map((item, index) => (
                        <tr key={`${item.extraId}-${index}`}>
                          <td>{item.code} - {item.name}</td>
                          <td>{item.priceMode === "POR_DIA" ? "Por día" : "Fijo"}</td>
                          <td>{item.units}</td>
                          <td>{item.amount.toFixed(2)}</td>
                          <td>
                            <button type="button" className="secondary-btn" onClick={() => removeExtraLine(index)} disabled={!canWrite}>
                              Quitar
                            </button>
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
                <input value={additionalDriverName} onChange={(e) => setAdditionalDriverName(e.target.value)} disabled={!canWrite} />
              </label>
              <label>
                Carnet de conducir
                <input value={additionalDriverLicense} onChange={(e) => setAdditionalDriverLicense(e.target.value)} disabled={!canWrite} />
              </label>
            </div>
          ) : null}

          <div className="table-header-row">
            <button className="primary-btn" type="submit" disabled={!canWrite}>
              Guardar reserva
            </button>
            <button
              className="secondary-btn"
              type="button"
              disabled={!canWrite}
              onClick={() => {
                setClientLookup("");
                setCustomerId(String(initialClient?.id ?? ""));
                setCustomerName(initialName);
                setCustomerCompany(String(initialClient?.companyName ?? ""));
                setCustomerCommissioner(String(initialClient?.commissionerName ?? ""));
                setSalesChannel(String(initialClient?.acquisitionChannel ?? ""));
                setBilledCarGroup("");
                setAssignedPlate("");
                setAssignedVehicleGroup("");
                setBaseAmount("0");
                setDiscountAmount("0");
                setSelectedExtraId(extraOptions[0]?.id ?? "");
                setExtraUnitsInput("1");
                setSelectedExtras([]);
                setFuelAmount("0");
                setInsuranceAmount("0");
                setPenaltiesAmount("0");
                setAdditionalDriverName("");
                setAdditionalDriverLicense("");
                setPriceLocked(false);
                setShowAvailability(false);
                setAvailabilityGroup("");
                setAvailabilityPlate("");
                setPriceRecalcHint("");
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
            <a className="secondary-btn text-center" href="/reservas?tab=logs">
              Auditoría
            </a>
          </div>

          {showAvailability ? (
            <div className="form-grid">
              <label>
                Grupo
                <select
                  value={availabilityGroup}
                  onChange={(e) => {
                    setAvailabilityGroup(e.target.value);
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
                  onChange={(e) => {
                    const plate = e.target.value;
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

        <input type="hidden" name="extrasBreakdown" value={extrasBreakdown} readOnly />
        <input type="hidden" name="extrasAmount" value={extrasAmount.toFixed(2)} readOnly />
        <input
          type="hidden"
          name="selectedExtrasPayload"
          value={JSON.stringify(selectedExtras.map((item) => ({ extraId: item.extraId, units: item.units })))}
          readOnly
        />
        <input type="hidden" name="totalPrice" value={total.toFixed(2)} readOnly />

        <input type="hidden" name="seriesCode" value="01" readOnly />
        <input type="hidden" name="docType" value="RESERVA" readOnly />
        <input type="hidden" name="contractType" value="STANDARD" readOnly />
        <input type="hidden" name="billingAccountCode" value="" readOnly />
        <input type="hidden" name="commissionAccountCode" value="" readOnly />
        <input type="hidden" name="clientAccountCode" value="" readOnly />
        <input type="hidden" name="voucherNumber" value="" readOnly />
        <input type="hidden" name="vehicleKeyCode" value="" readOnly />
        <input type="hidden" name="billedGroupOverride" value="" readOnly />
        <input type="hidden" name="referenceCode" value="" readOnly />
        <input type="hidden" name="dnhcCode" value="" readOnly />
        <input type="hidden" name="publicObservations" value="" readOnly />
        <input type="hidden" name="privateObservations" value="" readOnly />
        <input type="hidden" name="additionalDrivers" value={additionalDriversPayload} readOnly />
    </form>
  );
}
