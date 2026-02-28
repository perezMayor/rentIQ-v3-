import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-extras-test-"));

const {
  createClient,
  createFleetVehicle,
  createReservation,
  createVehicleCategory,
  createVehicleExtra,
  createVehicleModel,
  listReservations,
  registerFleetVehicleDrop,
} = await import("@/lib/services/rental-service");
const { readRentalData } = await import("@/lib/services/rental-store");

const ACTOR = { id: "u-admin", role: "ADMIN" as const };

async function seedBase() {
  await createVehicleCategory(
    {
      name: "Grupo A",
      code: "A",
      summary: "",
      transmissionRequired: "MANUAL",
      minSeats: "4",
      minDoors: "5",
      minLuggage: "2",
      fuelType: "GASOLINA",
      airConditioning: "true",
      insurancePrice: "0",
      deductiblePrice: "0",
      depositPrice: "0",
    },
    ACTOR,
  );

  const dataAfterCategory = await readRentalData();
  const category = dataAfterCategory.vehicleCategories[0];
  assert.ok(category?.id);

  await createVehicleModel(
    {
      brand: "SEAT",
      model: "IBIZA",
      transmission: "MANUAL",
      features: "",
      fuelType: "GASOLINA",
      categoryId: category.id,
    },
    ACTOR,
  );

  const dataAfterModel = await readRentalData();
  const model = dataAfterModel.vehicleModels[0];
  assert.ok(model?.id);

  await createFleetVehicle(
    {
      plate: "9999ABC",
      modelId: model.id,
      activeFrom: "2026-05-01",
      activeUntil: "2026-05-31",
      owner: "Proveedor Uno",
      acquisitionCost: "0",
    },
    ACTOR,
  );

  await createVehicleExtra(
    {
      code: "GPS",
      name: "GPS",
      priceMode: "POR_DIA",
      unitPrice: "6",
      maxDays: "2",
      active: "true",
    },
    ACTOR,
  );

  const client = await createClient(
    {
      clientType: "PARTICULAR",
      firstName: "Luis",
      lastName: "Extra",
      nationality: "España",
      language: "es",
      documentType: "DNI",
      documentNumber: "00000077X",
      licenseNumber: "LIC-077",
      email: "luis.extra@local.test",
      phone1: "600000777",
      birthDate: "1991-02-03",
      birthPlace: "Murcia",
      residenceStreet: "C/ Uno",
      residenceCity: "Murcia",
      residenceCountry: "España",
      vacationStreet: "C/ Dos",
      vacationCity: "Alicante",
      vacationCountry: "España",
      acquisitionChannel: "DIRECTO",
    },
    ACTOR,
  );

  const dataAfterExtra = await readRentalData();
  const extra = dataAfterExtra.vehicleExtras[0];
  assert.ok(extra?.id);

  return { client, extraId: extra.id };
}

async function testExtraServerRecalculation(clientId: string, extraId: string) {
  await createReservation(
    {
      customerId: clientId,
      customerName: "Luis Extra",
      branchDelivery: "ALC",
      deliveryPlace: "Aeropuerto",
      deliveryAt: "2026-05-10T10:00:00",
      pickupBranch: "ALC",
      pickupPlace: "Aeropuerto",
      pickupAt: "2026-05-12T10:00:00",
      billedCarGroup: "A",
      assignedPlate: "9999ABC",
      billedDays: "2",
      reservationStatus: "PETICION",
      baseAmount: "100",
      discountAmount: "0",
      extrasAmount: "9999", // intento manipulado en cliente
      fuelAmount: "0",
      insuranceAmount: "0",
      penaltiesAmount: "0",
      selectedExtrasPayload: JSON.stringify([{ extraId, units: 10 }]),
    },
    ACTOR,
  );

  const reservation = (await listReservations(""))[0];
  assert.ok(reservation);
  // maxDays=2 => 6*2 = 12
  assert.equal(Number(reservation.extrasAmount.toFixed(2)), 12);
  assert.ok(reservation.extrasBreakdown.includes("GPS"));
}

async function testDropBlocksReservation(clientId: string) {
  await registerFleetVehicleDrop(
    {
      plate: "9999ABC",
      deactivatedAt: "2026-05-09",
      deactivationReason: "Venta",
      deactivationAmount: "9000",
    },
    ACTOR,
  );

  await assert.rejects(
    async () => {
      await createReservation(
        {
          customerId: clientId,
          customerName: "Luis Extra",
          branchDelivery: "ALC",
          deliveryPlace: "Aeropuerto",
          deliveryAt: "2026-05-20T10:00:00",
          pickupBranch: "ALC",
          pickupPlace: "Aeropuerto",
          pickupAt: "2026-05-22T10:00:00",
          billedCarGroup: "A",
          assignedPlate: "9999ABC",
          billedDays: "2",
          reservationStatus: "PETICION",
          baseAmount: "100",
        },
        ACTOR,
      );
    },
    /dada de baja/i,
  );
}

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    const seeded = await seedBase();
    await testExtraServerRecalculation(seeded.client.id, seeded.extraId);
    await testDropBlocksReservation(seeded.client.id);
    console.log("OK test:extras");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
