// Módulo test-gastos.mts.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-gastos-test-"));

const { readRentalData, writeRentalData } = await import("@/lib/services/rental-store");
const {
  createDailyOperationalExpense,
  listDailyOperationalExpenses,
  validateDailyOperationalExpenses,
} = await import("@/lib/services/rental-service");

async function seedData() {
  const data = await readRentalData();
  data.vehicleCategories = [
    {
      id: "cat-a",
      code: "A",
      name: "Grupo A",
      summary: "",
      transmissionRequired: "MANUAL",
      minSeats: 4,
      minDoors: 3,
      minLuggage: 2,
      fuelType: "GASOLINA",
      airConditioning: true,
      insurancePrice: 0,
      deductiblePrice: 0,
      depositPrice: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  data.vehicleModels = [
    {
      id: "model-a",
      brand: "SEAT",
      model: "IBIZA",
      transmission: "MANUAL",
      features: "",
      fuelType: "GASOLINA",
      categoryId: "cat-a",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  data.fleetVehicles = [
    {
      id: "veh-1",
      plate: "1111AAA",
      modelId: "model-a",
      categoryId: "cat-a",
      owner: "",
      color: "",
      year: 2024,
      vin: "",
      odometerKm: 0,
      fuelType: "GASOLINA",
      activeFrom: "2026-01-01",
      activeUntil: "",
      acquisitionCost: 0,
      alertNotes: "",
      deactivatedAt: "",
      deactivationReason: "",
      deactivationAmount: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
    {
      id: "veh-2",
      plate: "2222BBB",
      modelId: "model-a",
      categoryId: "cat-a",
      owner: "",
      color: "",
      year: 2024,
      vin: "",
      odometerKm: 0,
      fuelType: "GASOLINA",
      activeFrom: "2026-01-01",
      activeUntil: "",
      acquisitionCost: 0,
      alertNotes: "",
      deactivatedAt: "",
      deactivationReason: "",
      deactivationAmount: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
    {
      id: "veh-3",
      plate: "3333CCC",
      modelId: "model-a",
      categoryId: "cat-a",
      owner: "",
      color: "",
      year: 2024,
      vin: "",
      odometerKm: 0,
      fuelType: "GASOLINA",
      activeFrom: "2026-01-01",
      activeUntil: "",
      acquisitionCost: 0,
      alertNotes: "",
      deactivatedAt: "",
      deactivationReason: "",
      deactivationAmount: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
    {
      id: "veh-4",
      plate: "4444DDD",
      modelId: "model-a",
      categoryId: "cat-a",
      owner: "",
      color: "",
      year: 2024,
      vin: "",
      odometerKm: 0,
      fuelType: "GASOLINA",
      activeFrom: "2026-01-01",
      activeUntil: "",
      acquisitionCost: 0,
      alertNotes: "",
      deactivatedAt: "",
      deactivationReason: "",
      deactivationAmount: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  data.contracts = [
    {
      id: "ctr-1",
      contractNumber: "26-ALC-00001",
      reservationId: "rsv-1",
      branchCode: "ALC",
      customerName: "Cliente 1",
      companyName: "",
      deliveryAt: "2026-03-10T08:00:00",
      pickupAt: "2026-03-10T20:00:00",
      vehiclePlate: "1111AAA",
      billedCarGroup: "A",
      status: "ABIERTO",
      priceBreakdown: "",
      extrasBreakdown: "",
      baseAmount: 0,
      discountAmount: 0,
      extrasAmount: 0,
      fuelAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      ivaPercent: 21,
      paymentsMade: 0,
      totalSettlement: 0,
      deductible: "",
      additionalDrivers: "",
      privateNotes: "",
      cashRecord: null,
      internalExpenseIds: [],
      checkOutAt: null,
      checkOutBy: "",
      checkOutKm: 0,
      checkOutFuelLevel: "",
      checkOutNotes: "",
      checkOutPhotos: "",
      checkOutSignatureName: "",
      checkOutSignatureHash: "",
      checkOutSignatureDevice: "",
      checkInAt: null,
      checkInBy: "",
      checkInKm: 0,
      checkInFuelLevel: "",
      checkInNotes: "",
      checkInPhotos: "",
      checkInSignatureName: "",
      checkInSignatureHash: "",
      checkInSignatureDevice: "",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      closedAt: null,
      invoiceId: null,
    },
    {
      id: "ctr-2",
      contractNumber: "26-ALC-00002",
      reservationId: "rsv-2",
      branchCode: "ALC",
      customerName: "Cliente 2",
      companyName: "",
      deliveryAt: "2026-03-10T07:00:00",
      pickupAt: "2026-03-10T21:00:00",
      vehiclePlate: "2222BBB",
      billedCarGroup: "A",
      status: "ABIERTO",
      priceBreakdown: "",
      extrasBreakdown: "",
      baseAmount: 0,
      discountAmount: 0,
      extrasAmount: 0,
      fuelAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      ivaPercent: 21,
      paymentsMade: 0,
      totalSettlement: 0,
      deductible: "",
      additionalDrivers: "",
      privateNotes: "",
      cashRecord: null,
      internalExpenseIds: [],
      checkOutAt: null,
      checkOutBy: "",
      checkOutKm: 0,
      checkOutFuelLevel: "",
      checkOutNotes: "",
      checkOutPhotos: "",
      checkOutSignatureName: "",
      checkOutSignatureHash: "",
      checkOutSignatureDevice: "",
      checkInAt: null,
      checkInBy: "",
      checkInKm: 0,
      checkInFuelLevel: "",
      checkInNotes: "",
      checkInPhotos: "",
      checkInSignatureName: "",
      checkInSignatureHash: "",
      checkInSignatureDevice: "",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      closedAt: null,
      invoiceId: null,
    },
    {
      id: "ctr-3",
      contractNumber: "26-ALC-00003",
      reservationId: "rsv-3",
      branchCode: "ALC",
      customerName: "Cliente 3",
      companyName: "",
      deliveryAt: "2026-03-10T09:00:00",
      pickupAt: "2026-03-10T22:00:00",
      vehiclePlate: "3333CCC",
      billedCarGroup: "A",
      status: "ABIERTO",
      priceBreakdown: "",
      extrasBreakdown: "",
      baseAmount: 0,
      discountAmount: 0,
      extrasAmount: 0,
      fuelAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      ivaPercent: 21,
      paymentsMade: 0,
      totalSettlement: 0,
      deductible: "",
      additionalDrivers: "",
      privateNotes: "",
      cashRecord: null,
      internalExpenseIds: [],
      checkOutAt: null,
      checkOutBy: "",
      checkOutKm: 0,
      checkOutFuelLevel: "",
      checkOutNotes: "",
      checkOutPhotos: "",
      checkOutSignatureName: "",
      checkOutSignatureHash: "",
      checkOutSignatureDevice: "",
      checkInAt: null,
      checkInBy: "",
      checkInKm: 0,
      checkInFuelLevel: "",
      checkInNotes: "",
      checkInPhotos: "",
      checkInSignatureName: "",
      checkInSignatureHash: "",
      checkInSignatureDevice: "",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      closedAt: null,
      invoiceId: null,
    },
  ];
  await writeRentalData(data);
}

async function testSplitAndValidationOk() {
  await createDailyOperationalExpense(
    {
      expenseDate: "2026-03-10",
      workerName: "Operario 1",
      category: "GASOLINA",
      amount: "10.00",
      vehiclePlates: "1111AAA,2222BBB,3333CCC",
      note: "test reparto",
    },
    { id: "u-admin", role: "ADMIN" },
  );

  const list = await listDailyOperationalExpenses({
    from: "2026-03-10",
    to: "2026-03-10",
    plate: "",
    worker: "Operario",
  });
  assert.equal(list.rows.length, 3);
  assert.equal(Number(list.totalAmount.toFixed(2)), 10);

  const amounts = list.rows.map((row) => row.amount).sort((a, b) => b - a);
  assert.deepEqual(
    amounts.map((value) => Number(value.toFixed(2))),
    [3.34, 3.33, 3.33],
  );

  const batches = Array.from(new Set(list.rows.map((row) => row.batchId).filter(Boolean)));
  assert.equal(batches.length, 1);

  const validation = await validateDailyOperationalExpenses({ from: "2026-03-10", to: "2026-03-10" });
  assert.equal(validation.ok, true);
}

async function testRejectPlateWithoutRental() {
  let failed = false;
  try {
    await createDailyOperationalExpense(
      {
        expenseDate: "2026-03-10",
        workerName: "Operario 2",
        category: "PARKING",
        amount: "12.00",
        vehiclePlates: "1111AAA,4444DDD",
        note: "test rechazo",
      },
      { id: "u-admin", role: "ADMIN" },
    );
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /alquiler activo/i);
  }
  assert.equal(failed, true);
}

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    await seedData();
    await testSplitAndValidationOk();
    await testRejectPlateWithoutRental();
    console.log("OK test:gastos");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
