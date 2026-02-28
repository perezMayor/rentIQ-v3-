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
  acquisitionChannel: string;
};

type Props = {
  action: (formData: FormData) => void;
  canWrite: boolean;
  clients: ClientLite[];
};

function clientDisplayName(client: ClientLite): string {
  const personal = `${client.firstName} ${client.lastName}`.trim();
  if (personal) return personal;
  if (client.companyName) return client.companyName;
  if (client.commissionerName) return client.commissionerName;
  return client.clientCode;
}

export function ContractCreateForm({ action, canWrite, clients }: Props) {
  const [lookup, setLookup] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [salesChannel, setSalesChannel] = useState("");

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
    setCustomerCompany(client.companyName || "");
    setSalesChannel(client.acquisitionChannel || "");
    setLookup(`${name} (${client.clientCode})`);
  }

  return (
    <form action={action} className="mini-form">
      <label>
        Cliente (ID o nombre)
        <input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Buscar cliente" disabled={!canWrite} />
      </label>

      {matches.length > 0 ? (
        <div className="quick-pick-list">
          {matches.map((client) => (
            <button key={client.id} type="button" className="quick-pick-item" onClick={() => fillClient(client)} disabled={!canWrite}>
              {clientDisplayName(client)} · {client.clientCode}
            </button>
          ))}
        </div>
      ) : null}

      <input name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="ID cliente" disabled={!canWrite} />
      <input name="customerName" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Cliente" disabled={!canWrite} />
      <input name="customerCompany" value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} placeholder="Empresa" disabled={!canWrite} />
      <input name="branchDelivery" placeholder="Sucursal entrega" disabled={!canWrite} />
      <input name="deliveryPlace" placeholder="Lugar entrega" disabled={!canWrite} />
      <input name="deliveryAt" type="datetime-local" disabled={!canWrite} />
      <input name="pickupBranch" placeholder="Sucursal recogida" disabled={!canWrite} />
      <input name="pickupPlace" placeholder="Lugar recogida" disabled={!canWrite} />
      <input name="pickupAt" type="datetime-local" disabled={!canWrite} />
      <input name="billedCarGroup" placeholder="Grupo" disabled={!canWrite} />
      <input name="assignedPlate" placeholder="Matrícula (opcional)" disabled={!canWrite} />
      <input name="appliedRate" placeholder="Tarifa" disabled={!canWrite} />
      <input name="salesChannel" value={salesChannel} onChange={(event) => setSalesChannel(event.target.value)} placeholder="Canal" disabled={!canWrite} />
      <input name="totalPrice" type="number" step="0.01" placeholder="Total" disabled={!canWrite} />
      <button className="primary-btn" type="submit" disabled={!canWrite}>Crear contrato</button>
    </form>
  );
}
