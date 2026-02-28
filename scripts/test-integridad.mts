import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-integridad-test-"));

const { readRentalData, writeRentalData } = await import("@/lib/services/rental-store");
const { validateDataIntegrity } = await import("@/lib/services/rental-service");

async function seedBrokenData() {
  const data = await readRentalData();

  data.vehicleModels = [
    {
      id: "model-ok",
      brand: "SEAT",
      model: "IBIZA",
      transmission: "MANUAL",
      features: "",
      fuelType: "GASOLINA",
      categoryId: "cat-ok",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  data.vehicleCategories = [
    {
      id: "cat-ok",
      code: "A",
      name: "Grupo A",
      summary: "",
      transmissionRequired: "MANUAL",
      minSeats: 4,
      minDoors: 5,
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
  data.fleetVehicles = [
    {
      id: "veh-1",
      plate: "1111AAA",
      modelId: "model-ok",
      categoryId: "cat-ok",
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
      plate: "1111AAA",
      modelId: "model-missing",
      categoryId: "cat-missing",
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
  data.reservations = [
    {
      id: "rsv-1",
      reservationNumber: "RES-1",
      seriesCode: "01",
      docType: "RESERVA",
      contractType: "STANDARD",
      billingAccountCode: "",
      commissionAccountCode: "",
      clientAccountCode: "",
      voucherNumber: "",
      branchDelivery: "ALC",
      customerName: "Cliente",
      customerCompany: "",
      customerCommissioner: "",
      deliveryPlace: "Lugar",
      deliveryAt: "2026-03-10T10:00:00",
      pickupBranch: "ALC",
      pickupPlace: "Lugar",
      pickupAt: "2026-03-12T10:00:00",
      deliveryFlightNumber: "",
      pickupFlightNumber: "",
      billedCarGroup: "A",
      modelRequested: "",
      assignedPlate: "9999ZZZ",
      vehicleKeyCode: "",
      billedDays: 2,
      billedGroupOverride: "",
      assignedVehicleGroup: "",
      priceBreakdown: "",
      extrasBreakdown: "",
      baseAmount: 0,
      discountAmount: 0,
      extrasAmount: 0,
      fuelAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      fuelPolicy: "",
      additionalDrivers: "",
      appliedRate: "",
      publicNotes: "",
      privateNotes: "",
      deductible: "",
      depositAmount: 0,
      privateObservations: "",
      publicObservations: "",
      referenceCode: "",
      dnhcCode: "",
      blockPlateForReservation: false,
      paymentsMade: 0,
      totalPrice: 0,
      salesChannel: "DIRECTO",
      ivaPercent: 21,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      contractId: "ctr-missing",
      reservationStatus: "CONFIRMADA",
      groupOverrideAccepted: false,
      groupOverrideReason: "",
      groupOverridePriceAdjustment: 0,
      groupOverridePriceAdjustedAt: "",
      confirmationSentLog: [],
      customerId: "cli-missing",
    },
    {
      id: "rsv-2",
      reservationNumber: "RES-1",
      seriesCode: "01",
      docType: "RESERVA",
      contractType: "STANDARD",
      billingAccountCode: "",
      commissionAccountCode: "",
      clientAccountCode: "",
      voucherNumber: "",
      branchDelivery: "ALC",
      customerName: "Cliente 2",
      customerCompany: "",
      customerCommissioner: "",
      deliveryPlace: "Lugar",
      deliveryAt: "2026-03-15T10:00:00",
      pickupBranch: "ALC",
      pickupPlace: "Lugar",
      pickupAt: "2026-03-17T10:00:00",
      deliveryFlightNumber: "",
      pickupFlightNumber: "",
      billedCarGroup: "A",
      modelRequested: "",
      assignedPlate: "1111AAA",
      vehicleKeyCode: "",
      billedDays: 2,
      billedGroupOverride: "",
      assignedVehicleGroup: "",
      priceBreakdown: "",
      extrasBreakdown: "",
      baseAmount: 0,
      discountAmount: 0,
      extrasAmount: 0,
      fuelAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      fuelPolicy: "",
      additionalDrivers: "",
      appliedRate: "",
      publicNotes: "",
      privateNotes: "",
      deductible: "",
      depositAmount: 0,
      privateObservations: "",
      publicObservations: "",
      referenceCode: "",
      dnhcCode: "",
      blockPlateForReservation: false,
      paymentsMade: 0,
      totalPrice: 0,
      salesChannel: "DIRECTO",
      ivaPercent: 21,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      contractId: null,
      reservationStatus: "PETICION",
      groupOverrideAccepted: false,
      groupOverrideReason: "",
      groupOverridePriceAdjustment: 0,
      groupOverridePriceAdjustedAt: "",
      confirmationSentLog: [],
      customerId: null,
    },
  ];
  data.contracts = [];
  data.invoices = [
    {
      id: "inv-1",
      invoiceNumber: "F26-ALC-00001",
      invoiceName: "Factura 1",
      contractId: "ctr-missing",
      issuedAt: new Date().toISOString(),
      baseAmount: 0,
      extrasAmount: 0,
      insuranceAmount: 0,
      penaltiesAmount: 0,
      ivaPercent: 21,
      ivaAmount: 0,
      totalAmount: 0,
      sentLog: [],
    },
  ];
  data.internalExpenses = [
    {
      id: "exp-1",
      contractId: "__DIARIO__",
      vehiclePlate: "9999ZZZ",
      expenseDate: "2026-03-10",
      category: "GASOLINA",
      amount: 10,
      note: "x",
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  await writeRentalData(data);
}

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    await seedBrokenData();
    const report = await validateDataIntegrity();
    assert.equal(report.ok, false);
    assert.ok((report.byCode.RESERVATION_CUSTOMER_NOT_FOUND ?? 0) >= 1);
    assert.ok((report.byCode.DUPLICATE_RESERVATION_NUMBER ?? 0) >= 1);
    assert.ok((report.byCode.DUPLICATE_FLEET_PLATE ?? 0) >= 1);
    assert.ok((report.byCode.INTERNAL_EXPENSE_PLATE_NOT_IN_FLEET ?? 0) >= 1);
    assert.ok((report.byCode.INVOICE_CONTRACT_NOT_FOUND ?? 0) >= 1);
    console.log("OK test:integridad");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
