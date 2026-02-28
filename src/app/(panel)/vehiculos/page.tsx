import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  createFleetVehicle,
  createVehicleCategory,
  createVehicleExtra,
  createVehicleModel,
  deleteFleetVehicle,
  deleteVehicleCategory,
  deleteVehicleExtra,
  deleteVehicleModel,
  getReservationForecast,
  getCompanySettings,
  getVehicleProductionSummary,
  listContracts,
  listFleetVehicles,
  listReservations,
  listVehicleCategories,
  listVehicleExtras,
  listVehicleModels,
  registerFleetVehicleDrop,
  updateFleetVehicle,
  updateVehicleCategory,
  updateVehicleExtra,
  updateVehicleModel,
} from "@/lib/services/rental-service";

type TabKey = "grupos" | "modelos" | "altas-bajas" | "listados" | "produccion" | "extras";

type Props = {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    prodFrom?: string;
    prodTo?: string;
    listFrom?: string;
    listTo?: string;
    limitDate?: string;
    listType?: string;
  }>;
};

function getDefaultRange(daysBack: number, daysAhead: number) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);
  const to = new Date(now);
  to.setDate(to.getDate() + daysAhead);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function asDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "grupos", label: "Grupos" },
  { key: "modelos", label: "Modelos" },
  { key: "altas-bajas", label: "Altas / bajas" },
  { key: "listados", label: "Listados" },
  { key: "produccion", label: "Producción" },
  { key: "extras", label: "Extras" },
];

export default async function VehiculosPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const canWrite = user.role !== "LECTOR";
  const tab = (TABS.find((item) => item.key === params.tab)?.key ?? "grupos") as TabKey;

  const models = await listVehicleModels();
  const categories = await listVehicleCategories();
  const fleet = await listFleetVehicles();
  const extras = await listVehicleExtras();
  const settings = await getCompanySettings();
  const providerOptions = settings.providers ?? [];

  const listRange = getDefaultRange(30, 30);
  const listFrom = params.listFrom ?? listRange.from;
  const listTo = params.listTo ?? listRange.to;
  const limitDate = params.limitDate ?? listRange.to;
  const listType =
    params.listType === "situacion" ||
    params.listType === "general" ||
    params.listType === "bajas" ||
    params.listType === "general_bajas" ||
    params.listType === "limite"
      ? params.listType
      : "";

  const prodRange = getDefaultRange(30, 0);
  const prodFrom = params.prodFrom ?? prodRange.from;
  const prodTo = params.prodTo ?? prodRange.to;

  async function createCategoryAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=grupos&error=Permiso+denegado");
    try {
      await createVehicleCategory(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=grupos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear grupo";
      redirect(`/vehiculos?tab=grupos&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateCategoryAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=grupos&error=Permiso+denegado");
    const categoryId = String(formData.get("categoryId") ?? "");
    try {
      await updateVehicleCategory(categoryId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=grupos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar grupo";
      redirect(`/vehiculos?tab=grupos&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteCategoryAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=grupos&error=Permiso+denegado");
    const categoryId = String(formData.get("categoryId") ?? "");
    try {
      await deleteVehicleCategory(categoryId, { id: actor.id, role: actor.role });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=grupos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar grupo";
      redirect(`/vehiculos?tab=grupos&error=${encodeURIComponent(message)}`);
    }
  }

  async function createModelAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=modelos&error=Permiso+denegado");
    try {
      await createVehicleModel(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=modelos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear modelo";
      redirect(`/vehiculos?tab=modelos&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateModelAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=modelos&error=Permiso+denegado");
    const modelId = String(formData.get("modelId") ?? "");
    try {
      await updateVehicleModel(modelId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=modelos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar modelo";
      redirect(`/vehiculos?tab=modelos&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteModelAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=modelos&error=Permiso+denegado");
    const modelId = String(formData.get("modelId") ?? "");
    try {
      await deleteVehicleModel(modelId, { id: actor.id, role: actor.role });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=modelos");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar modelo";
      redirect(`/vehiculos?tab=modelos&error=${encodeURIComponent(message)}`);
    }
  }

  async function createFleetAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=altas-bajas&error=Permiso+denegado");
    try {
      await createFleetVehicle(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=altas-bajas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error en alta";
      redirect(`/vehiculos?tab=altas-bajas&error=${encodeURIComponent(message)}`);
    }
  }

  async function registerDropAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=altas-bajas&error=Permiso+denegado");
    try {
      await registerFleetVehicleDrop(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=altas-bajas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error en baja";
      redirect(`/vehiculos?tab=altas-bajas&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateFleetAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=altas-bajas&error=Permiso+denegado");
    const vehicleId = String(formData.get("vehicleId") ?? "");
    try {
      await updateFleetVehicle(vehicleId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=altas-bajas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar vehículo";
      redirect(`/vehiculos?tab=altas-bajas&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteFleetAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=altas-bajas&error=Permiso+denegado");
    const vehicleId = String(formData.get("vehicleId") ?? "");
    try {
      await deleteFleetVehicle(vehicleId, { id: actor.id, role: actor.role });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=altas-bajas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar vehículo";
      redirect(`/vehiculos?tab=altas-bajas&error=${encodeURIComponent(message)}`);
    }
  }

  async function createExtraAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=extras&error=Permiso+denegado");
    try {
      await createVehicleExtra(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=extras");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al crear extra";
      redirect(`/vehiculos?tab=extras&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateExtraAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=extras&error=Permiso+denegado");
    const extraId = String(formData.get("extraId") ?? "");
    try {
      await updateVehicleExtra(extraId, Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=extras");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al editar extra";
      redirect(`/vehiculos?tab=extras&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteExtraAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/vehiculos?tab=extras&error=Permiso+denegado");
    const extraId = String(formData.get("extraId") ?? "");
    try {
      await deleteVehicleExtra(extraId, { id: actor.id, role: actor.role });
      revalidatePath("/vehiculos");
      redirect("/vehiculos?tab=extras");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al borrar extra";
      redirect(`/vehiculos?tab=extras&error=${encodeURIComponent(message)}`);
    }
  }

  const reservations = await listReservations("");
  const contracts = await listContracts("");

  const fleetActive = fleet.filter((item) => !item.deactivatedAt);
  const fleetDropped = fleet.filter((item) => Boolean(item.deactivatedAt));
  const fleetAll = fleet;

  const listFromIso = `${listFrom}T00:00:00`;
  const listToIso = `${listTo}T23:59:59`;

  const idleVehicles = fleetActive
    .map((vehicle) => {
      const history = reservations
        .filter((reservation) => reservation.assignedPlate.toUpperCase() === vehicle.plate.toUpperCase())
        .toSorted((a, b) => b.pickupAt.localeCompare(a.pickupAt));
      const overlaps = history.some((reservation) => {
        const d1 = asDate(reservation.deliveryAt);
        const d2 = asDate(reservation.pickupAt);
        const fromDate = asDate(listFromIso);
        const toDate = asDate(listToIso);
        if (!d1 || !d2 || !fromDate || !toDate) return false;
        return d1 < toDate && fromDate < d2;
      });
      const openContract = contracts.find(
        (contract) => contract.status === "ABIERTO" && contract.vehiclePlate.toUpperCase() === vehicle.plate.toUpperCase(),
      );
      const lastReservation = history[0] ?? null;
      return {
        plate: vehicle.plate,
        modelLabel: vehicle.modelLabel,
        status: overlaps ? "ALQUILADO_EN_RANGO" : "NO_ALQUILADO",
        location: openContract
          ? `Alquilado (${openContract.contractNumber})`
          : lastReservation?.pickupPlace || lastReservation?.pickupBranch || "Base",
        lastPickupAt: lastReservation?.pickupAt || "N/D",
      };
    })
    .filter((item) => item.status === "NO_ALQUILADO");

  const limitDateIso = `${limitDate}T23:59:59`;
  const expiringVehicles = fleetActive.filter((vehicle) => {
    if (!vehicle.activeUntil) return false;
    const vDate = asDate(`${vehicle.activeUntil}T23:59:59`);
    const lDate = asDate(limitDateIso);
    if (!vDate || !lDate) return false;
    return vDate <= lDate;
  });

  const production = await getVehicleProductionSummary({ from: listFromIso, to: listToIso });
  const prodByGroup = new Map<string, { income: number; expenses: number; costBase: number; profitability: number }>();
  const prodByModel = new Map<string, { income: number; expenses: number; costBase: number; profitability: number }>();
  for (const row of production) {
    const vehicle = fleet.find((item) => item.plate.toUpperCase() === row.plate.toUpperCase());
    const groupKey = vehicle?.categoryLabel || "N/D";
    const modelKey = vehicle?.modelLabel || "N/D";
    const g = prodByGroup.get(groupKey) ?? { income: 0, expenses: 0, costBase: 0, profitability: 0 };
    g.income += row.income;
    g.expenses += row.expenses;
    g.costBase += row.costBase;
    g.profitability += row.profitability;
    prodByGroup.set(groupKey, g);
    const m = prodByModel.get(modelKey) ?? { income: 0, expenses: 0, costBase: 0, profitability: 0 };
    m.income += row.income;
    m.expenses += row.expenses;
    m.costBase += row.costBase;
    m.profitability += row.profitability;
    prodByModel.set(modelKey, m);
  }

  const groupRows = Array.from(prodByGroup.entries()).toSorted((a, b) => a[0].localeCompare(b[0]));
  const modelRows = Array.from(prodByModel.entries()).toSorted((a, b) => a[0].localeCompare(b[0]));
  const productionTotals = production.reduce(
    (acc, row) => {
      acc.income += row.income;
      acc.expenses += row.expenses;
      acc.costBase += row.costBase;
      acc.profitability += row.profitability;
      return acc;
    },
    { income: 0, expenses: 0, costBase: 0, profitability: 0 },
  );

  const forecast = await getReservationForecast({ from: listFrom, to: listTo });

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Vehículos</h2>
        <p className="muted-text">Módulo por pestañas exclusivas: una abierta y el resto cerradas.</p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {!canWrite ? <p className="danger-text">Modo lectura: no puedes modificar datos.</p> : null}

      <section className="card stack-sm">
        <div className="inline-actions-cell">
          {TABS.map((item) => (
            <a
              key={item.key}
              href={`/vehiculos?tab=${item.key}`}
              className={tab === item.key ? "primary-btn text-center" : "secondary-btn text-center"}
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>

      {tab === "grupos" ? (
        <section className="card stack-md">
          <h3>Grupos</h3>
          <form action={createCategoryAction} className="form-grid">
            <label>
              Nombre del grupo *
              <input name="name" required disabled={!canWrite} />
            </label>
            <label>
              Código (opcional)
              <input name="code" disabled={!canWrite} placeholder="A, B, C..." />
            </label>
            <label>
              Transmisión (manual / automático)
              <select name="transmissionRequired" defaultValue="MANUAL" disabled={!canWrite}>
                <option value="MANUAL">Manual</option>
                <option value="AUTOMATICO">Automático</option>
              </select>
            </label>
            <label className="col-span-2">
              Descripción
              <input name="summary" disabled={!canWrite} />
            </label>
            <label>
              Precio seguro
              <input name="insurancePrice" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
            </label>
            <label>
              Precio franquicia
              <input name="deductiblePrice" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
            </label>
            <label>
              Precio fianza
              <input name="depositPrice" type="number" step="0.01" defaultValue="0" disabled={!canWrite} />
            </label>
            <div className="col-span-2">
              <button className="primary-btn" type="submit" disabled={!canWrite}>Añadir grupo</button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Grupo</th><th>Transmisión</th><th>Descripción</th><th>Seguro</th><th>Franquicia</th><th>Fianza</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr><td colSpan={7} className="muted-text">Sin grupos.</td></tr>
                ) : (
                  categories.map((category) => (
                    <tr key={category.id}>
                      <td>{category.code || category.name}</td>
                      <td>{category.transmissionRequired}</td>
                      <td>{category.summary || "N/D"}</td>
                      <td>{(category.insurancePrice ?? 0).toFixed(2)}</td>
                      <td>{(category.deductiblePrice ?? 0).toFixed(2)}</td>
                      <td>{(category.depositPrice ?? 0).toFixed(2)}</td>
                      <td>
                        <details>
                          <summary>Editar / Borrar</summary>
                          <form action={updateCategoryAction} className="mini-form">
                            <input type="hidden" name="categoryId" value={category.id} />
                            <label>Nombre<input name="name" defaultValue={category.name} /></label>
                            <label>Código<input name="code" defaultValue={category.code} /></label>
                            <label>Transmisión<select name="transmissionRequired" defaultValue={category.transmissionRequired}><option value="MANUAL">Manual</option><option value="AUTOMATICO">Automático</option></select></label>
                            <label>Descripción<input name="summary" defaultValue={category.summary} /></label>
                            <label>Seguro<input name="insurancePrice" type="number" step="0.01" defaultValue={String(category.insurancePrice ?? 0)} /></label>
                            <label>Franquicia<input name="deductiblePrice" type="number" step="0.01" defaultValue={String(category.deductiblePrice ?? 0)} /></label>
                            <label>Fianza<input name="depositPrice" type="number" step="0.01" defaultValue={String(category.depositPrice ?? 0)} /></label>
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                          </form>
                          <form action={deleteCategoryAction} className="mini-form">
                            <input type="hidden" name="categoryId" value={category.id} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar</button>
                          </form>
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

      {tab === "modelos" ? (
        <section className="card stack-md">
          <h3>Modelos</h3>
          <form action={createModelAction} className="form-grid">
            <label>
              Marca *
              <input name="brand" required disabled={!canWrite} />
            </label>
            <label>
              Modelo *
              <input name="model" required disabled={!canWrite} />
            </label>
            <label>
              Características
              <input name="features" disabled={!canWrite} />
            </label>
            <label>
              Tipo de combustible
              <input name="fuelType" disabled={!canWrite} />
            </label>
            <label>
              Grupo al que pertenece *
              <select name="categoryId" disabled={!canWrite} required>
                <option value="">Selecciona</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.code || category.name} - {category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Transmisión
              <select name="transmission" defaultValue="MANUAL" disabled={!canWrite}>
                <option value="MANUAL">Manual</option>
                <option value="AUTOMATICO">Automático</option>
              </select>
            </label>
            <div className="col-span-2">
              <button className="primary-btn" type="submit" disabled={!canWrite}>Añadir modelo</button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Marca</th><th>Modelo</th><th>Características</th><th>Combustible</th><th>Grupo</th><th>Acciones</th></tr></thead>
              <tbody>
                {models.length === 0 ? (
                  <tr><td colSpan={6} className="muted-text">Sin modelos.</td></tr>
                ) : (
                  models.map((model) => {
                    const category = categories.find((item) => item.id === model.categoryId);
                    return (
                      <tr key={model.id}>
                        <td>{model.brand}</td>
                        <td>{model.model}</td>
                        <td>{model.features || "N/D"}</td>
                        <td>{model.fuelType || "N/D"}</td>
                        <td>{category ? `${category.code || category.name} - ${category.name}` : "N/D"}</td>
                        <td>
                          <details>
                            <summary>Editar / Borrar</summary>
                            <form action={updateModelAction} className="mini-form">
                              <input type="hidden" name="modelId" value={model.id} />
                              <label>Marca<input name="brand" defaultValue={model.brand} /></label>
                              <label>Modelo<input name="model" defaultValue={model.model} /></label>
                              <label>Características<input name="features" defaultValue={model.features} /></label>
                              <label>Combustible<input name="fuelType" defaultValue={model.fuelType} /></label>
                              <label>Grupo<select name="categoryId" defaultValue={model.categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.code || category.name} - {category.name}</option>)}</select></label>
                              <label>Transmisión<select name="transmission" defaultValue={model.transmission}><option value="MANUAL">Manual</option><option value="AUTOMATICO">Automático</option></select></label>
                              <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                            </form>
                            <form action={deleteModelAction} className="mini-form">
                              <input type="hidden" name="modelId" value={model.id} />
                              <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "altas-bajas" ? (
        <section className="stack-md">
          <section className="card stack-sm">
            <h3>Altas</h3>
            <form action={createFleetAction} className="form-grid">
              <label>Matrícula *<input name="plate" required disabled={!canWrite} /></label>
              <label>
                Marca / modelo *
                <select name="modelId" required disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.brand} {model.model}</option>)}
                </select>
              </label>
              <label>
                Grupo (automático por modelo)
                <input value="Se asigna automáticamente" readOnly />
              </label>
              <label>Bastidor<input name="vin" disabled={!canWrite} /></label>
              <label>Kms iniciales<input name="odometerKm" type="number" min={0} defaultValue="0" disabled={!canWrite} /></label>
              <label>Fecha de alta *<input name="activeFrom" type="date" required disabled={!canWrite} /></label>
              <label>Fecha límite alquiler<input name="activeUntil" type="date" disabled={!canWrite} /></label>
              <label>
                Propietario del coche
                <input name="owner" disabled={!canWrite} placeholder="Proveedor" list="providers-list" />
                <datalist id="providers-list">
                  {providerOptions.map((provider) => <option key={provider} value={provider} />)}
                </datalist>
              </label>
              <label>Precio del coche<input name="acquisitionCost" type="number" step="0.01" disabled={!canWrite} /></label>
              <label className="col-span-2">Alertas<input name="alertNotes" disabled={!canWrite} placeholder="Notas/alertas del vehículo" /></label>
              <div className="col-span-2"><button className="primary-btn" type="submit" disabled={!canWrite}>Dar alta</button></div>
            </form>

            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Matrícula</th><th>Marca/Modelo</th><th>Grupo</th><th>Alta</th><th>Límite alquiler</th><th>Propietario</th><th>Acciones</th></tr></thead>
                <tbody>
                  {fleetActive.length === 0 ? <tr><td colSpan={7} className="muted-text">Sin flota activa.</td></tr> : fleetActive.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>{vehicle.plate}</td>
                      <td>{vehicle.modelLabel}</td>
                      <td>{vehicle.categoryLabel}</td>
                      <td>{vehicle.activeFrom || "N/D"}</td>
                      <td>{vehicle.activeUntil || "N/D"}</td>
                      <td>{vehicle.owner || "N/D"}</td>
                      <td>
                        <details>
                          <summary>Editar / Borrar</summary>
                          <form action={updateFleetAction} className="mini-form">
                            <input type="hidden" name="vehicleId" value={vehicle.id} />
                            <label>
                              Propietario
                              <input name="owner" defaultValue={vehicle.owner} list={`providers-list-edit-${vehicle.id}`} />
                              <datalist id={`providers-list-edit-${vehicle.id}`}>
                                {providerOptions.map((provider) => <option key={`${vehicle.id}-${provider}`} value={provider} />)}
                              </datalist>
                            </label>
                            <label>Bastidor<input name="vin" defaultValue={vehicle.vin} /></label>
                            <label>Kms<input name="odometerKm" type="number" defaultValue={String(vehicle.odometerKm)} /></label>
                            <label>Fecha alta<input name="activeFrom" type="date" defaultValue={vehicle.activeFrom} /></label>
                            <label>Límite alquiler<input name="activeUntil" type="date" defaultValue={vehicle.activeUntil} /></label>
                            <label>Precio<input name="acquisitionCost" type="number" step="0.01" defaultValue={String(vehicle.acquisitionCost)} /></label>
                            <label>Alertas<input name="alertNotes" defaultValue={vehicle.alertNotes} /></label>
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                          </form>
                          <form action={deleteFleetAction} className="mini-form">
                            <input type="hidden" name="vehicleId" value={vehicle.id} />
                            <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar</button>
                          </form>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card stack-sm">
            <h3>Bajas</h3>
            <form action={registerDropAction} className="form-grid">
              <label>
                Matrícula *
                <select name="plate" required disabled={!canWrite}>
                  <option value="">Selecciona</option>
                  {fleetActive.map((vehicle) => <option key={`drop-${vehicle.id}`} value={vehicle.plate}>{vehicle.plate} · {vehicle.modelLabel}</option>)}
                </select>
              </label>
              <label>
                Marca / modelo
                <input value="Se completa automáticamente por matrícula" readOnly />
              </label>
              <label>
                Fecha adquisición
                <input value="Se toma de la fecha de alta" readOnly />
              </label>
              <label>Fecha de baja *<input name="deactivatedAt" type="date" required disabled={!canWrite} /></label>
              <label>Motivo de baja<input name="deactivationReason" disabled={!canWrite} /></label>
              <label>Importe (si venta)<input name="deactivationAmount" type="number" step="0.01" defaultValue="0" disabled={!canWrite} /></label>
              <div className="col-span-2"><button className="primary-btn" type="submit" disabled={!canWrite}>Registrar baja</button></div>
            </form>

            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Matrícula</th><th>Marca/Modelo</th><th>Fecha alta</th><th>Fecha baja</th><th>Motivo</th><th>Importe</th></tr></thead>
                <tbody>
                  {fleetDropped.length === 0 ? <tr><td colSpan={6} className="muted-text">Sin bajas.</td></tr> : fleetDropped.map((vehicle) => (
                    <tr key={`d-${vehicle.id}`}>
                      <td>{vehicle.plate}</td>
                      <td>{vehicle.modelLabel}</td>
                      <td>{vehicle.activeFrom || "N/D"}</td>
                      <td>{vehicle.deactivatedAt || "N/D"}</td>
                      <td>{vehicle.deactivationReason || "N/D"}</td>
                      <td>{(vehicle.deactivationAmount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {tab === "listados" ? (
        <section className="card stack-sm">
          <h3>Listados</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="listados" />
            <input name="listFrom" type="date" defaultValue={listFrom} />
            <input name="listTo" type="date" defaultValue={listTo} />
            <input name="limitDate" type="date" defaultValue={limitDate} />
            <select name="listType" defaultValue={listType}>
              <option value="">Selecciona listado</option>
              <option value="situacion">Situación: coches no alquilados</option>
              <option value="general">General: flota actual</option>
              <option value="bajas">Listado de bajas</option>
              <option value="general_bajas">Flota actual + bajas</option>
              <option value="limite">Fecha límite de alquiler</option>
            </select>
            <button className="secondary-btn" type="submit">Generar</button>
          </form>
          {listType ? (
            <div className="inline-actions-cell">
              <a
                className="secondary-btn text-center"
                href={`/api/reporting/vehiculos/export?type=${encodeURIComponent(listType)}&from=${encodeURIComponent(listFrom)}&to=${encodeURIComponent(listTo)}&limitDate=${encodeURIComponent(limitDate)}`}
              >
                Exportar listado
              </a>
            </div>
          ) : null}

          {listType === "" ? <p className="muted-text">Selecciona un filtro y pulsa &quot;Generar&quot;.</p> : null}

          {listType === "situacion" ? (
            <>
              <h4>Situación: coches no alquilados</h4>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Matrícula</th><th>Modelo</th><th>Dónde está</th><th>Último alquiler (recogida)</th></tr></thead>
                  <tbody>
                    {idleVehicles.length === 0 ? <tr><td colSpan={4} className="muted-text">Sin resultados.</td></tr> : idleVehicles.map((row) => (
                      <tr key={`idle-${row.plate}`}><td>{row.plate}</td><td>{row.modelLabel}</td><td>{row.location}</td><td>{row.lastPickupAt}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {listType === "general" ? (
            <>
              <h4>General: flota actual</h4>
              <SimpleFleetTable rows={fleetActive} />
            </>
          ) : null}

          {listType === "bajas" ? (
            <>
              <h4>Listado de bajas</h4>
              <SimpleFleetTable rows={fleetDropped} />
            </>
          ) : null}

          {listType === "general_bajas" ? (
            <>
              <h4>Flota actual + bajas</h4>
              <SimpleFleetTable rows={fleetAll} />
            </>
          ) : null}

          {listType === "limite" ? (
            <>
              <h4>Fecha límite de alquiler</h4>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Matrícula</th><th>Modelo</th><th>Límite alquiler</th><th>Estado</th></tr></thead>
                  <tbody>
                    {expiringVehicles.length === 0 ? <tr><td colSpan={4} className="muted-text">Sin vehículos en ese límite.</td></tr> : expiringVehicles.map((vehicle) => (
                      <tr key={`exp-${vehicle.id}`}>
                        <td>{vehicle.plate}</td>
                        <td>{vehicle.modelLabel}</td>
                        <td>{vehicle.activeUntil}</td>
                        <td>{vehicle.deactivatedAt ? "BAJA" : "ALTA"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "produccion" ? (
        <section className="card stack-sm">
          <h3>Producción</h3>
          <form method="GET" className="inline-search">
            <input type="hidden" name="tab" value="produccion" />
            <input name="prodFrom" type="date" defaultValue={prodFrom} />
            <input name="prodTo" type="date" defaultValue={prodTo} />
            <button className="secondary-btn" type="submit">Calcular</button>
          </form>

          <h4>General</h4>
          <p className="muted-text">Ingresos: {productionTotals.income.toFixed(2)} | Gastos: {productionTotals.expenses.toFixed(2)} | Coste base: {productionTotals.costBase.toFixed(2)} | Rentabilidad: {productionTotals.profitability.toFixed(2)}</p>

          <h4>Individual por coche</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Matrícula</th><th>Ingresos</th><th>Gastos</th><th>Coste coche</th><th>Rentabilidad</th><th>Gráfico</th></tr></thead>
              <tbody>
                {production.length === 0 ? <tr><td colSpan={6} className="muted-text">Sin datos.</td></tr> : production.map((row) => {
                  const max = Math.max(1, Math.abs(productionTotals.profitability));
                  const width = Math.min(100, Math.round((Math.abs(row.profitability) / max) * 100));
                  return (
                    <tr key={`prod-${row.plate}`}>
                      <td>{row.plate}</td>
                      <td>{row.income.toFixed(2)}</td>
                      <td>{row.expenses.toFixed(2)}</td>
                      <td>{row.costBase.toFixed(2)}</td>
                      <td>{row.profitability.toFixed(2)}</td>
                      <td>
                        <div style={{ background: "#dbeafe", height: 10, borderRadius: 4 }}>
                          <div style={{ width: `${width}%`, height: 10, borderRadius: 4, background: row.profitability >= 0 ? "#16a34a" : "#dc2626" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h4>Por grupos</h4>
          <AggregateTable rows={groupRows} />

          <h4>Por modelos</h4>
          <AggregateTable rows={modelRows} />

          <h4>Previsión (rango seleccionado)</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Grupo</th><th>Coches requeridos</th><th>Disponibles</th><th>Déficit</th></tr></thead>
              <tbody>
                {forecast.length === 0 ? <tr><td colSpan={4} className="muted-text">Sin previsión.</td></tr> : forecast.map((row) => (
                  <tr key={`fc-${row.group}`}><td>{row.group}</td><td>{row.required}</td><td>{row.available}</td><td>{row.deficit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "extras" ? (
        <section className="card stack-sm">
          <h3>Extras</h3>
          <p className="muted-text">Precio fijo o por día con máximo opcional para sumar en reservas.</p>
          <form action={createExtraAction} className="form-grid">
            <label>Código *<input name="code" required disabled={!canWrite} /></label>
            <label>Nombre *<input name="name" required disabled={!canWrite} /></label>
            <label>
              Tipo de precio
              <select name="priceMode" defaultValue="FIJO" disabled={!canWrite}>
                <option value="FIJO">Precio fijo</option>
                <option value="POR_DIA">Precio por día</option>
              </select>
            </label>
            <label>Precio<input name="unitPrice" type="number" step="0.01" defaultValue="0" disabled={!canWrite} /></label>
            <label>Máximo días (opcional)<input name="maxDays" type="number" min={0} defaultValue="0" disabled={!canWrite} /></label>
            <label>
              Activo
              <select name="active" defaultValue="true" disabled={!canWrite}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
            <div className="col-span-2"><button className="primary-btn" type="submit" disabled={!canWrite}>Añadir extra</button></div>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Precio</th><th>Máx días</th><th>Activo</th><th>Acciones</th></tr></thead>
              <tbody>
                {extras.length === 0 ? <tr><td colSpan={7} className="muted-text">Sin extras.</td></tr> : extras.map((extra) => (
                  <tr key={extra.id}>
                    <td>{extra.code}</td>
                    <td>{extra.name}</td>
                    <td>{extra.priceMode === "POR_DIA" ? "Por día" : "Fijo"}</td>
                    <td>{extra.unitPrice.toFixed(2)}</td>
                    <td>{extra.maxDays || "N/D"}</td>
                    <td>{extra.active ? "Sí" : "No"}</td>
                    <td>
                      <details>
                        <summary>Editar / Borrar</summary>
                        <form action={updateExtraAction} className="mini-form">
                          <input type="hidden" name="extraId" value={extra.id} />
                          <label>Código<input name="code" defaultValue={extra.code} /></label>
                          <label>Nombre<input name="name" defaultValue={extra.name} /></label>
                          <label>Tipo<select name="priceMode" defaultValue={extra.priceMode}><option value="FIJO">Fijo</option><option value="POR_DIA">Por día</option></select></label>
                          <label>Precio<input name="unitPrice" type="number" step="0.01" defaultValue={String(extra.unitPrice)} /></label>
                          <label>Máx días<input name="maxDays" type="number" defaultValue={String(extra.maxDays)} /></label>
                          <label>Activo<select name="active" defaultValue={extra.active ? "true" : "false"}><option value="true">Sí</option><option value="false">No</option></select></label>
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                        </form>
                        <form action={deleteExtraAction} className="mini-form">
                          <input type="hidden" name="extraId" value={extra.id} />
                          <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SimpleFleetTable({ rows }: { rows: Array<{ id: string; plate: string; modelLabel: string; categoryLabel: string; owner: string; activeFrom: string; activeUntil: string; deactivatedAt: string; deactivationReason: string }> }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Matrícula</th><th>Modelo</th><th>Grupo</th><th>Propietario</th><th>Alta</th><th>Límite</th><th>Baja</th><th>Motivo</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={8} className="muted-text">Sin datos.</td></tr> : rows.map((row) => (
            <tr key={`fleet-${row.id}`}>
              <td>{row.plate}</td>
              <td>{row.modelLabel}</td>
              <td>{row.categoryLabel}</td>
              <td>{row.owner || "N/D"}</td>
              <td>{row.activeFrom || "N/D"}</td>
              <td>{row.activeUntil || "N/D"}</td>
              <td>{row.deactivatedAt || "N/D"}</td>
              <td>{row.deactivationReason || "N/D"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregateTable({
  rows,
}: {
  rows: Array<[string, { income: number; expenses: number; costBase: number; profitability: number }]>;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Clave</th><th>Ingresos</th><th>Gastos</th><th>Coste</th><th>Rentabilidad</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={5} className="muted-text">Sin datos.</td></tr> : rows.map(([key, row]) => (
            <tr key={`agg-${key}`}>
              <td>{key}</td>
              <td>{row.income.toFixed(2)}</td>
              <td>{row.expenses.toFixed(2)}</td>
              <td>{row.costBase.toFixed(2)}</td>
              <td>{row.profitability.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
