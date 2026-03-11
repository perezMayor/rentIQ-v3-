"use client";

import { useMemo, useState } from "react";

type Props = {
  action: (formData: FormData) => void;
  canWrite: boolean;
  models: Array<{ id: string; label: string; groupLabel: string }>;
  providerOptions: string[];
};

export function FleetCreateForm({ action, canWrite, models, providerOptions }: Props) {
  const [modelId, setModelId] = useState("");
  const selectedModel = useMemo(
    () => models.find((item) => item.id === modelId) ?? null,
    [modelId, models],
  );

  return (
    <form action={action} className="form-grid">
      <label>
        Matrícula *
        <input name="plate" required disabled={!canWrite} />
      </label>
      <label>
        Marca / modelo *
        <select name="modelId" required value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!canWrite}>
          <option value="">Selecciona</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-compact">
        Grupo
        <input value={selectedModel?.groupLabel ?? ""} readOnly placeholder="Automático" />
      </label>
      <label>
        Propietario del coche
        <input name="owner" disabled={!canWrite} placeholder="Proveedor" list="providers-list" />
        <datalist id="providers-list">
          {providerOptions.map((provider) => (
            <option key={provider} value={provider} />
          ))}
        </datalist>
      </label>
      <label>
        Fecha de alta *
        <input name="activeFrom" type="date" required disabled={!canWrite} />
      </label>
      <label>
        Fecha de baja / límite alquiler
        <input name="activeUntil" type="date" disabled={!canWrite} />
      </label>
      <label>
        Kms iniciales
        <input name="odometerKm" type="number" min={0} defaultValue="0" disabled={!canWrite} />
      </label>
      <label>
        Bastidor
        <input name="vin" disabled={!canWrite} />
      </label>
      <label>
        Precio del coche
        <input name="acquisitionCost" type="number" step="0.01" disabled={!canWrite} />
      </label>
      <label className="col-span-2">
        Alertas
        <input name="alertNotes" disabled={!canWrite} placeholder="Notas/alertas del vehículo" />
      </label>
      <div className="col-span-2">
        <button className="primary-btn" type="submit" disabled={!canWrite}>
          Dar alta
        </button>
      </div>
    </form>
  );
}
