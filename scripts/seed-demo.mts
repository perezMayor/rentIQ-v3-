import {
  closeContract,
  convertReservationToContract,
  createClient,
  createDailyOperationalExpense,
  createFleetVehicle,
  createReservation,
  createTariffPlan,
  createVehicleCategory,
  createVehicleExtra,
  createVehicleModel,
  listContracts,
  listTariffPlans,
  listVehicleCategories,
  listVehicleModels,
  registerContractCash,
  updateCompanySettings,
  upsertTariffBracket,
  upsertTariffPrice,
} from "@/lib/services/rental-service";
import { readRentalData } from "@/lib/services/rental-store";

const ACTOR = { id: "u-super-admin", role: "SUPER_ADMIN" as const };

async function runIgnoreDuplicate(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ya existe|duplicado/i.test(message)) {
      return;
    }
    throw error;
  }
}

function getStoreSummary(data: Awaited<ReturnType<typeof readRentalData>>) {
  return {
    clients: data.clients.length,
    reservations: data.reservations.length,
    contracts: data.contracts.length,
    vehicleCategories: data.vehicleCategories.length,
    fleetVehicles: data.fleetVehicles.length,
    tariffPlans: data.tariffPlans.length,
  };
}

function assertStoreEmptyOrFail(data: Awaited<ReturnType<typeof readRentalData>>, force: boolean) {
  const summary = getStoreSummary(data);
  const hasData = Object.values(summary).some((value) => value > 0);
  if (hasData) {
    if (!force) {
      throw new Error(
        `Seed bloqueado: el almacén ya contiene datos (${JSON.stringify(summary)}). ` +
          "Ejecuta en instalación limpia o usa --force bajo tu responsabilidad.",
      );
    }
    console.warn(`AVISO: seed:demo ejecutado con --force sobre almacén no vacío (${JSON.stringify(summary)}).`);
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const data = await readRentalData();
  assertStoreEmptyOrFail(data, force);

  await updateCompanySettings(
    {
      companyName: "RentIQ Demo",
      companyEmailFrom: "N/D",
      taxId: "B00000000",
      fiscalAddress: "Av. Demo 1, Murcia",
      defaultIvaPercent: "21",
      backupRetentionDays: "90",
      invoiceSeriesF: "F",
      invoiceSeriesR: "R",
      invoiceSeriesV: "V",
      invoiceSeriesA: "A",
      branchesRaw: "ALC|Sucursal Alicante\nMUR|Sucursal Murcia",
    },
    ACTOR,
  );

  await runIgnoreDuplicate(() =>
    createVehicleCategory(
      {
        name: "Grupo A",
        code: "A",
        summary: "Utilitario",
        transmissionRequired: "MANUAL",
        minSeats: "4",
        minDoors: "3",
        minLuggage: "2",
        fuelType: "GASOLINA",
        airConditioning: "true",
      },
      ACTOR,
    ),
  );
  await runIgnoreDuplicate(() =>
    createVehicleCategory(
      {
        name: "Grupo B",
        code: "B",
        summary: "Compacto",
        transmissionRequired: "MANUAL",
        minSeats: "5",
        minDoors: "5",
        minLuggage: "3",
        fuelType: "GASOLINA",
        airConditioning: "true",
      },
      ACTOR,
    ),
  );

  await runIgnoreDuplicate(() => createVehicleModel({ brand: "SEAT", model: "IBIZA", transmission: "MANUAL", features: "" }, ACTOR));
  await runIgnoreDuplicate(() => createVehicleModel({ brand: "RENAULT", model: "CLIO", transmission: "MANUAL", features: "" }, ACTOR));

  await runIgnoreDuplicate(() =>
    createVehicleExtra({ code: "GPS", name: "GPS", priceMode: "POR_DIA", unitPrice: "6", maxDays: "7", active: "true" }, ACTOR),
  );
  await runIgnoreDuplicate(() =>
    createVehicleExtra({ code: "SILLA", name: "Silla bebé", priceMode: "FIJO", unitPrice: "15", maxDays: "0", active: "true" }, ACTOR),
  );

  const categories = await listVehicleCategories();
  const models = await listVehicleModels();
  const catA = categories.find((item) => item.code === "A");
  const catB = categories.find((item) => item.code === "B");
  const modelIbiza = models.find((item) => item.model.toUpperCase() === "IBIZA");
  const modelClio = models.find((item) => item.model.toUpperCase() === "CLIO");
  if (!catA || !catB || !modelIbiza || !modelClio) {
    throw new Error("Seed inválido: no se pudieron resolver categorías/modelos");
  }

  await runIgnoreDuplicate(() =>
    createFleetVehicle(
      { plate: "1111AAA", modelId: modelIbiza.id, categoryId: catA.id, owner: "RentIQ", activeFrom: "2026-03-01" },
      ACTOR,
    ),
  );
  await runIgnoreDuplicate(() =>
    createFleetVehicle(
      { plate: "2222BBB", modelId: modelClio.id, categoryId: catB.id, owner: "RentIQ", activeFrom: "2026-03-01" },
      ACTOR,
    ),
  );
  await runIgnoreDuplicate(() =>
    createFleetVehicle(
      { plate: "3333CCC", modelId: modelIbiza.id, categoryId: catA.id, owner: "RentIQ", activeFrom: "2026-03-01" },
      ACTOR,
    ),
  );

  const clientParticular = await createClient(
    {
      clientType: "PARTICULAR",
      firstName: "Juan",
      lastName: "Pérez",
      nationality: "España",
      language: "es",
      documentType: "DNI",
      documentNumber: "00000001A",
      licenseNumber: "LIC-0001",
      email: "juan.demo@local.test",
      phone1: "600000001",
      birthDate: "1990-01-01",
      birthPlace: "Murcia",
      residenceStreet: "Calle Sol 1",
      residenceCity: "Murcia",
      residenceCountry: "España",
      vacationStreet: "Av. Mar 2",
      vacationCity: "Alicante",
      vacationCountry: "España",
      acquisitionChannel: "DIRECTO",
      allowDuplicateLoad: "true",
    },
    ACTOR,
  );

  await createClient(
    {
      clientType: "EMPRESA",
      companyName: "Empresa Demo SL",
      taxId: "B12345678",
      fiscalAddress: "C/ Empresa 2, Alicante",
      email: "empresa.demo@local.test",
      acquisitionChannel: "AGENCIA",
      allowDuplicateLoad: "true",
    },
    ACTOR,
  );

  await runIgnoreDuplicate(() =>
    createTariffPlan(
      {
        code: "TP-DEMO",
        title: "Tarifa demo 1-3-7",
        season: "General",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        active: "true",
      },
      ACTOR,
    ),
  );
  const plan = (await listTariffPlans("TP-DEMO"))[0];
  if (!plan) {
    throw new Error("Seed inválido: no se pudo crear tarifa");
  }

  await upsertTariffBracket({ tariffPlanId: plan.id, label: "1 día", fromDay: "1", toDay: "1", order: "1" }, ACTOR);
  await upsertTariffBracket({ tariffPlanId: plan.id, label: "3 días", fromDay: "3", toDay: "3", order: "2" }, ACTOR);
  await upsertTariffBracket({ tariffPlanId: plan.id, label: "7 días", fromDay: "7", toDay: "7", order: "3" }, ACTOR);
  await upsertTariffBracket(
    { tariffPlanId: plan.id, label: "Extra", fromDay: "8", toDay: "999", order: "4", isExtraDay: "true" },
    ACTOR,
  );

  const dataAfterBrackets = await readRentalData();
  const brackets = dataAfterBrackets.tariffBrackets.filter((item) => item.tariffPlanId === plan.id);
  const b1 = brackets.find((item) => item.label === "1 día");
  const b3 = brackets.find((item) => item.label === "3 días");
  const b7 = brackets.find((item) => item.label === "7 días");
  const bx = brackets.find((item) => item.label === "Extra");
  if (!b1 || !b3 || !b7 || !bx) {
    throw new Error("Seed inválido: faltan tramos de tarifa");
  }

  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b1.id, groupCode: "A", price: "35", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b3.id, groupCode: "A", price: "90", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b7.id, groupCode: "A", price: "180", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: bx.id, groupCode: "A", price: "30", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b1.id, groupCode: "B", price: "40", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b3.id, groupCode: "B", price: "105", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: b7.id, groupCode: "B", price: "210", maxKmPerDay: "0" }, ACTOR);
  await upsertTariffPrice({ tariffPlanId: plan.id, bracketId: bx.id, groupCode: "B", price: "35", maxKmPerDay: "0" }, ACTOR);

  await runIgnoreDuplicate(() =>
    createReservation(
      {
        customerId: clientParticular.id,
        customerName: `${clientParticular.firstName} ${clientParticular.lastName}`,
        branchDelivery: "ALC",
        deliveryPlace: "Aeropuerto",
        deliveryAt: "2026-03-10T09:00:00",
        pickupBranch: "ALC",
        pickupPlace: "Aeropuerto",
        pickupAt: "2026-03-12T09:00:00",
        billedCarGroup: "A",
        assignedPlate: "1111AAA",
        billedDays: "3",
        appliedRate: "TP-DEMO",
        reservationStatus: "PETICION",
        salesChannel: "DIRECTO",
        selectedExtrasPayload: JSON.stringify([]),
      },
      ACTOR,
    ),
  );

  const dataAfterReservation = await readRentalData();
  const pendingReservation = dataAfterReservation.reservations
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((reservation) => !reservation.contractId);
  if (pendingReservation) {
    await runIgnoreDuplicate(() => convertReservationToContract(pendingReservation.id, ACTOR));
  }

  const openContract = (await listContracts("")).find((item) => item.status === "ABIERTO");
  if (openContract) {
    await runIgnoreDuplicate(() =>
      registerContractCash(
        openContract.id,
        { amount: "120", method: "TARJETA", cardLast4: "1234", notes: "Pago demo" },
        ACTOR,
      ),
    );
    await runIgnoreDuplicate(() => closeContract(openContract.id, ACTOR));
  }

  await createDailyOperationalExpense(
    {
      expenseDate: "2026-03-10",
      workerName: "Operario Demo",
      category: "GASOLINA",
      amount: "12",
      vehiclePlates: "1111AAA",
      note: "Carga demo",
    },
    ACTOR,
  );

  console.log("OK seed:demo");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
