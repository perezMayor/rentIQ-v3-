"use client";

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
  const initialName = initialClient ? clientDisplayName(initialClient) : "";
  const [clientLookup, setClientLookup] = useState("");
  const [customerId, setCustomerId] = useState(initialClient?.id ?? "");
  const [customerName, setCustomerName] = useState(initialName);
  const [customerCompany, setCustomerCompany] = useState(initialClient?.companyName ?? "");
  const [customerCommissioner, setCustomerCommissioner] = useState(initialClient?.commissionerName ?? "");
  const [salesChannel, setSalesChannel] = useState(initialClient?.acquisitionChannel ?? "");
  const [assignedPlate, setAssignedPlate] = useState("");
  const [assignedVehicleGroup, setAssignedVehicleGroup] = useState("");

  const [baseAmount, setBaseAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [selectedExtraId, setSelectedExtraId] = useState("");
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
  const extrasBreakdown = useMemo(
    () =>
      selectedExtras.length === 0
        ? ""
        : selectedExtras
            .map((item) => `${item.code}:${item.name} x${item.units} (${item.priceMode === "POR_DIA" ? "día" : "fijo"}) = ${item.amount.toFixed(2)}`)
            .join(" | "),
    [selectedExtras],
  );

  function fillFromClient(client: ClientLite) {
    const name = clientDisplayName(client);
    setCustomerId(client.id);
    setCustomerName(name);
    setCustomerCompany(client.companyName || "");
    setCustomerCommissioner(client.commissionerName || "");
    setSalesChannel(client.acquisitionChannel || "");
    setClientLookup(`${name} (${client.clientCode})`);
  }

  function handleAssignedPlateChange(nextPlate: string) {
    setAssignedPlate(nextPlate);
    const found = vehicles.find((vehicle) => vehicle.plate.toUpperCase() === nextPlate.trim().toUpperCase());
    setAssignedVehicleGroup(found?.groupLabel || "");
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
    <form action={action} className="reservation-create-layout">
      <div className="stack-md">
        <section className="card-muted stack-sm">
          <h4>1) Cliente</h4>
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
              <input name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canWrite} />
            </label>
            <label>
              Cliente *
              <input
                name="customerName"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label>
              Empresa
              <input
                name="customerCompany"
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label>
              Comisionista
              <input
                name="customerCommissioner"
                value={customerCommissioner}
                onChange={(e) => setCustomerCommissioner(e.target.value)}
                disabled={!canWrite}
              />
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
          </div>
        </section>

        <section className="card-muted stack-sm">
          <h4>3) Vehículo</h4>
          <div className="form-grid">
            <label>
              Grupo reservado *
              <input name="billedCarGroup" required disabled={!canWrite} />
            </label>
            <label>
              Matrícula (manual)
              <input
                name="assignedPlate"
                value={assignedPlate}
                onChange={(e) => handleAssignedPlateChange(e.target.value)}
                disabled={!canWrite}
              />
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
        </section>

        <section className="card-muted stack-sm">
          <h4>4) Notas</h4>
          <div className="form-grid">
            <label className="col-span-2">
              Nota pública
              <textarea name="publicNotes" rows={2} disabled={!canWrite} />
            </label>
            <label className="col-span-2">
              Nota privada
              <textarea name="privateNotes" rows={2} disabled={!canWrite} />
            </label>
            <label className="col-span-2">
              Extras (detalle)
              <textarea value={extrasBreakdown} rows={2} disabled />
            </label>
            <label>
              Conductores adicionales
              <input name="additionalDrivers" disabled={!canWrite} />
            </label>
          </div>
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

        <div>
          <button className="primary-btn" type="submit" disabled={!canWrite}>
            Guardar reserva
          </button>
        </div>
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
        <label>
          Canal de venta
          <input
            name="salesChannel"
            value={salesChannel}
            onChange={(e) => setSalesChannel(e.target.value)}
            list="sales-channels-list"
            disabled={!canWrite}
          />
          <datalist id="sales-channels-list">
            {salesChannels.map((channel) => (
              <option key={channel} value={channel} />
            ))}
          </datalist>
        </label>
        <label>
          Estado
          <select name="reservationStatus" defaultValue="CONFIRMADA" disabled={!canWrite}>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="PETICION">Petición</option>
          </select>
        </label>
        <label>
          IVA %
          <input name="ivaPercent" type="number" step="0.01" defaultValue="21" disabled={!canWrite} />
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
          Pagos realizados
          <input name="paymentsMade" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
        </label>
        <label>
          Combustible
          <input name="fuelPolicy" disabled={!canWrite} />
        </label>

        <label>
          Importe base
          <input name="baseAmount" type="number" step="0.01" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} disabled={!canWrite} />
        </label>
        <label>
          Descuento
          <input name="discountAmount" type="number" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={!canWrite} />
        </label>
        <label>
          Extras
          <input name="extrasAmountPreview" type="number" step="0.01" value={extrasAmount.toFixed(2)} readOnly />
        </label>
        <label>
          Combustible
          <input name="fuelAmount" type="number" step="0.01" value={fuelAmount} onChange={(e) => setFuelAmount(e.target.value)} disabled={!canWrite} />
        </label>
        <label>
          Seguros
          <input name="insuranceAmount" type="number" step="0.01" value={insuranceAmount} onChange={(e) => setInsuranceAmount(e.target.value)} disabled={!canWrite} />
        </label>
        <label>
          Penalizaciones
          <input name="penaltiesAmount" type="number" step="0.01" value={penaltiesAmount} onChange={(e) => setPenaltiesAmount(e.target.value)} disabled={!canWrite} />
        </label>
        <div className="price-total-box">
          <span>Total</span>
          <strong>{total.toFixed(2)}</strong>
        </div>

        <div className="stack-sm">
          <h5>Selector de extras</h5>
          <label>
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
          <label>
            Unidades / días
            <input value={extraUnitsInput} onChange={(e) => setExtraUnitsInput(e.target.value)} type="number" min={1} disabled={!canWrite} />
          </label>
          <button type="button" className="secondary-btn" onClick={addExtraLine} disabled={!canWrite || !selectedExtraId}>
            Añadir extra
          </button>
          {selectedExtras.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Extra</th><th>Tipo</th><th>Unidades</th><th>Importe</th><th></th></tr></thead>
                <tbody>
                  {selectedExtras.map((item, index) => (
                    <tr key={`${item.extraId}-${index}`}>
                      <td>{item.code} - {item.name}</td>
                      <td>{item.priceMode === "POR_DIA" ? "Por día" : "Fijo"}</td>
                      <td>{item.units}</td>
                      <td>{item.amount.toFixed(2)}</td>
                      <td><button type="button" className="secondary-btn" onClick={() => removeExtraLine(index)} disabled={!canWrite}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">Sin extras añadidos.</p>
          )}
        </div>
      </aside>
    </form>
  );
}
