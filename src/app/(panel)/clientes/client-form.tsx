"use client";
// Módulo client-form.tsx.

import { useEffect, useMemo, useRef, useState } from "react";

type ExistingClient = {
  id: string;
  clientCode: string;
  clientType: "PARTICULAR" | "EMPRESA" | "COMISIONISTA";
  firstName: string;
  lastName: string;
  companyName: string;
  documentNumber: string;
  licenseNumber: string;
  taxId: string;
  email: string;
  warnings: string;
};

type Props = {
  action: (formData: FormData) => void;
  deactivateAction: (formData: FormData) => void;
  canWrite: boolean;
  nextClientCode: string;
  existingClients: ExistingClient[];
};

const LANG_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "de", label: "Alemán" },
  { value: "fr", label: "Francés" },
];

const PAYMENT_METHOD_OPTIONS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];
const DOCUMENT_TYPE_OPTIONS = ["DNI", "NIE", "PASAPORTE", "CIF", "OTRO"];

export function ClientForm({ action, deactivateAction, canWrite, nextClientCode, existingClients }: Props) {
  const [clientType, setClientType] = useState<"PARTICULAR" | "EMPRESA" | "COMISIONISTA">("PARTICULAR");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const warnedClientIds = useRef<Set<string>>(new Set());

  const isParticular = clientType === "PARTICULAR";

  const duplicateHits = useMemo(() => {
    const doc = documentNumber.trim().toLowerCase();
    const lic = licenseNumber.trim().toLowerCase();
    const tax = taxId.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    return existingClients.filter((client) => {
      if (doc && client.documentNumber.trim().toLowerCase() === doc) return true;
      if (lic && client.licenseNumber.trim().toLowerCase() === lic) return true;
      if (tax && client.taxId.trim().toLowerCase() === tax) return true;
      if (mail && client.email.trim().toLowerCase() === mail) return true;
      return false;
    });
  }, [documentNumber, licenseNumber, taxId, email, existingClients]);

  useEffect(() => {
    if (!isParticular) return;
    const normalizedFirst = firstName.trim().toLowerCase();
    if (!normalizedFirst) return;
    for (const client of existingClients) {
      const clientFirst = client.firstName.trim().toLowerCase();
      if (clientFirst !== normalizedFirst) continue;
      const warningText = client.warnings.trim();
      if (!warningText) continue;
      if (warnedClientIds.current.has(client.id)) continue;
      warnedClientIds.current.add(client.id);
      window.alert(`Aviso cliente ${client.clientCode}: ${warningText}`);
    }
  }, [isParticular, firstName, lastName, existingClients]);

  return (
    <div className="stack-md">
      <form action={action} className="stack-md">
      <section className="card-muted stack-sm">
        <div className="form-grid">
          <label>
            Tipo cliente
            <select
              name="clientType"
              value={clientType}
              onChange={(event) => setClientType(event.target.value as "PARTICULAR" | "EMPRESA" | "COMISIONISTA")}
              disabled={!canWrite}
            >
              <option value="PARTICULAR">Particular</option>
              <option value="EMPRESA">Empresa</option>
              <option value="COMISIONISTA">Comisionista</option>
            </select>
          </label>
          <label>
            ID
            <input value={nextClientCode ?? ""} readOnly />
          </label>

          {isParticular ? (
            <>
              <label>
                Nombre *
                <input name="firstName" value={firstName ?? ""} onChange={(e) => setFirstName(e.target.value)} required disabled={!canWrite} />
              </label>
              <label>
                Apellidos *
                <input name="lastName" value={lastName ?? ""} onChange={(e) => setLastName(e.target.value)} required disabled={!canWrite} />
              </label>

              <label>
                Documento *
                <select name="documentType" defaultValue="DNI" disabled={!canWrite}>
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nº documento *
                <input name="documentNumber" value={documentNumber ?? ""} onChange={(e) => setDocumentNumber(e.target.value)} required disabled={!canWrite} />
              </label>

              <label>
                Permiso de conducir *
                <input name="licenseNumber" value={licenseNumber ?? ""} onChange={(e) => setLicenseNumber(e.target.value)} required disabled={!canWrite} />
              </label>
              <div aria-hidden="true" />

              <label>
                Expedición documento
                <input name="documentIssuedAt" type="date" disabled={!canWrite} />
              </label>
              <label>
                Caducidad documento
                <input name="documentExpiresAt" type="date" disabled={!canWrite} />
              </label>

              <label>
                Expedición carné
                <input name="licenseIssuedAt" type="date" disabled={!canWrite} />
              </label>
              <label>
                Caducidad carné
                <input name="licenseExpiresAt" type="date" disabled={!canWrite} />
              </label>

              <label>
                Fecha nacimiento *
                <input name="birthDate" type="date" required disabled={!canWrite} />
              </label>
              <label>
                Lugar nacimiento *
                <input name="birthPlace" required disabled={!canWrite} />
              </label>

              <label>
                Mail *
                <input name="email" type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} required disabled={!canWrite} />
              </label>
              <label>
                Teléfono 1 *
                <input name="phone1" required disabled={!canWrite} />
              </label>

              <label>
                Teléfono 2
                <input name="phone2" disabled={!canWrite} />
              </label>
              <label>
                Idioma *
                <select name="language" defaultValue="es" disabled={!canWrite}>
                  {LANG_OPTIONS.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Forma de pago
                <select name="paymentMethod" defaultValue="TARJETA" disabled={!canWrite}>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comisión fija (%)
                <input name="commissionPercent" type="number" step="0.01" min="0" defaultValue="0" disabled={!canWrite} />
              </label>
              <div aria-hidden="true" />
            </>
          ) : (
            <>
              <label>
                Razón social *
                <input name="companyName" required disabled={!canWrite} />
              </label>
              <label>
                Persona de contacto
                <input name="contactPerson" disabled={!canWrite} />
              </label>
              <label>
                Documento
                <select name="documentType" defaultValue="CIF" disabled={!canWrite}>
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                NIF/CIF *
                <input name="taxId" value={taxId ?? ""} onChange={(e) => setTaxId(e.target.value)} required disabled={!canWrite} />
              </label>
              <label>
                Mail *
                <input name="email" type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} required disabled={!canWrite} />
              </label>
              <label>
                Teléfono
                <input name="phone1" disabled={!canWrite} />
              </label>
              <label className="col-span-2">
                Domicilio fiscal *
                <input name="fiscalAddress" required disabled={!canWrite} />
              </label>
              <label>
                Idioma
                <select name="language" defaultValue="es" disabled={!canWrite}>
                  {LANG_OPTIONS.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Forma de pago
                <select name="paymentMethod" defaultValue="TRANSFERENCIA" disabled={!canWrite}>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comisión fija (%)
                <input name="commissionPercent" type="number" step="0.01" min="0" defaultValue="0" disabled={!canWrite} />
              </label>
            </>
          )}
        </div>
      </section>

      {isParticular ? (
        <>
          <section className="card-muted stack-sm">
            <h4>Dirección habitual</h4>
            <div className="form-grid">
              <label>
                Calle *
                <input name="residenceStreet" required disabled={!canWrite} />
              </label>
              <label>
                Nº / piso
                <input name="residenceAddress" disabled={!canWrite} />
              </label>
              <label>
                Ciudad *
                <input name="residenceCity" required disabled={!canWrite} />
              </label>
              <label>
                Provincia
                <input name="residenceRegion" disabled={!canWrite} />
              </label>
              <label>
                Código postal
                <input name="residencePostalCode" disabled={!canWrite} />
              </label>
              <label>
                País *
                <input name="residenceCountry" defaultValue="España" required disabled={!canWrite} />
              </label>
            </div>
          </section>

          <section className="card-muted stack-sm">
            <h4>Dirección de vacaciones</h4>
            <div className="form-grid">
              <label>
                Calle *
                <input name="vacationStreet" required disabled={!canWrite} />
              </label>
              <label>
                Nº / piso
                <input name="vacationAddress" disabled={!canWrite} />
              </label>
              <label>
                Ciudad *
                <input name="vacationCity" required disabled={!canWrite} />
              </label>
              <label>
                Provincia
                <input name="vacationRegion" disabled={!canWrite} />
              </label>
              <label>
                Código postal
                <input name="vacationPostalCode" disabled={!canWrite} />
              </label>
              <label>
                País *
                <input name="vacationCountry" defaultValue="España" required disabled={!canWrite} />
              </label>
            </div>
          </section>
        </>
      ) : null}

      <section className="card-muted stack-sm">
        <h4>Observaciones y avisos</h4>
        <div className="form-grid">
          <label className="col-span-2">
            Observaciones
            <textarea name="notes" rows={2} disabled={!canWrite} />
          </label>
          <label className="col-span-2">
            Avisos
            <textarea name="warnings" rows={2} disabled={!canWrite} />
          </label>
        </div>
      </section>

      {duplicateHits.length > 0 ? (
        <div className="danger-box">
          <strong>Posible duplicidad detectada</strong>
          <ul className="simple-list">
            {duplicateHits.slice(0, 5).map((client) => (
              <li key={client.id}>
                {client.clientCode} · {client.clientType} · {`${client.firstName} ${client.lastName}`.trim() || client.companyName || "N/D"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <input type="hidden" name="acquisitionChannel" value="DIRECTO" />
      <input type="hidden" name="allowDuplicateLoad" value="false" />
      <input type="hidden" name="companyDrivers" value="" />
      <input type="hidden" name="companyDriverCompanyId" value="" />

      <div className="inline-actions-cell">
        <button className="primary-btn" type="submit" disabled={!canWrite}>
          Guardar
        </button>
        <button className="secondary-btn" type="reset" disabled={!canWrite}>
          Limpiar datos
        </button>
        <a className="secondary-btn text-center" href="/clientes">
          Ver histórico de reservas
        </a>
        <a className="secondary-btn text-center" href="/reservas">
          Reserva
        </a>
        <a className="secondary-btn text-center" href="/dashboard">
          Salir
        </a>
      </div>

      </form>

      <section className="card-muted stack-sm">
        <h4>Dar de baja cliente existente</h4>
        <form action={deactivateAction} className="inline-search">
          <input name="clientId" placeholder="ID cliente" list="clients-deactivate-list" required disabled={!canWrite} />
          <datalist id="clients-deactivate-list">
            {existingClients.map((client) => (
              <option key={`deactivate-${client.id}`} value={client.id}>
                {client.clientCode} | {`${client.firstName} ${client.lastName}`.trim() || client.companyName || "N/D"}
              </option>
            ))}
          </datalist>
          <button className="secondary-btn" type="submit" disabled={!canWrite}>
            Dar de baja
          </button>
        </form>
      </section>
    </div>
  );
}
