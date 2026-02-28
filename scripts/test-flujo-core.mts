import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-flujo-core-"));

const {
  addInternalExpense,
  closeContract,
  convertReservationToContract,
  createClient,
  createDailyOperationalExpense,
  createFleetVehicle,
  createReservation,
  createVehicleCategory,
  createVehicleModel,
  getVehicleProductionSummary,
  listContracts,
  listExpenseJournal,
  listInvoices,
  registerContractCash,
  updateReservation,
} = await import("@/lib/services/rental-service");
const { readRentalData } = await import("@/lib/services/rental-store");

const ACTOR = { id: "u-admin", role: "ADMIN" as const };

async function seedBase() {
  await createVehicleCategory(
    {
      name: "Grupo A",
      code: "A",
      summary: "Utilitario",
      transmissionRequired: "MANUAL",
      minSeats: "4",
      minDoors: "5",
      minLuggage: "2",
      fuelType: "GASOLINA",
      airConditioning: "true",
    },
    ACTOR,
  );
  await createVehicleModel({ brand: "SEAT", model: "IBIZA", transmission: "MANUAL", features: "" }, ACTOR);

  const data = await readRentalData();
  const category = data.vehicleCategories[0];
  const model = data.vehicleModels[0];
  assert.ok(category?.id);
  assert.ok(model?.id);

  await createFleetVehicle(
    {
      plate: "1234ABC",
      modelId: model.id,
      categoryId: category.id,
      owner: "RENTIQ",
      activeFrom: "2026-04-01",
      acquisitionCost: "0",
    },
    ACTOR,
  );

  const client = await createClient(
    {
      clientType: "PARTICULAR",
      firstName: "Ana",
      lastName: "Prueba",
      nationality: "España",
      language: "es",
      documentType: "DNI",
      documentNumber: "00000099Z",
      licenseNumber: "LIC-0099",
      email: "ana.prueba@local.test",
      phone1: "600000009",
      birthDate: "1992-04-03",
      birthPlace: "Murcia",
      residenceStreet: "Calle Test 1",
      residenceCity: "Murcia",
      residenceCountry: "España",
      vacationStreet: "Av Test 2",
      vacationCity: "Alicante",
      vacationCountry: "España",
      acquisitionChannel: "DIRECTO",
    },
    ACTOR,
  );

  await createReservation(
    {
      customerId: client.id,
      customerName: `${client.firstName} ${client.lastName}`,
      branchDelivery: "ALC",
      deliveryPlace: "Aeropuerto",
      deliveryAt: "2026-04-10T10:00:00",
      pickupBranch: "ALC",
      pickupPlace: "Aeropuerto",
      pickupAt: "2026-04-12T10:00:00",
      billedCarGroup: "A",
      assignedPlate: "1234ABC",
      billedDays: "2",
      reservationStatus: "PETICION",
      salesChannel: "DIRECTO",
      baseAmount: "100",
      discountAmount: "10",
      extrasAmount: "20",
      fuelAmount: "5",
      insuranceAmount: "0",
      penaltiesAmount: "0",
      ivaPercent: "21",
      paymentsMade: "0",
      totalPrice: "115",
    },
    ACTOR,
  );
}

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    await seedBase();

    const afterReservation = await readRentalData();
    const reservation = afterReservation.reservations[0];
    assert.ok(reservation?.id);

    await convertReservationToContract(reservation.id, ACTOR);
    const contract = (await listContracts("")).find((item) => item.reservationId === reservation.id);
    assert.ok(contract?.id);

    // Snapshot de contrato: cambios posteriores en reserva no deben afectar factura final.
    await updateReservation(
      reservation.id,
      {
        baseAmount: "999",
        extrasAmount: "777",
        insuranceAmount: "300",
        penaltiesAmount: "200",
        totalPrice: "2276",
      },
      ACTOR,
    );

    await addInternalExpense(
      contract.id,
      {
        category: "PEAJE",
        amount: "12.50",
        vehiclePlate: "1234ABC",
        expenseDate: "2026-04-10",
        note: "Gasto interno contrato",
      },
      ACTOR,
    );
    await createDailyOperationalExpense(
      {
        expenseDate: "2026-04-10",
        workerName: "Operario 1",
        category: "GASOLINA",
        amount: "9.00",
        vehiclePlates: "1234ABC",
        note: "Gasto diario",
      },
      ACTOR,
    );

    await registerContractCash(contract.id, { amount: "115", method: "TARJETA", cardLast4: "1111", notes: "" }, ACTOR);
    await closeContract(contract.id, ACTOR);

    // Conflicto de contratación: misma matrícula y solape exige override + motivo.
    await createReservation(
      {
        customerId: reservation.customerId ?? "",
        customerName: reservation.customerName,
        branchDelivery: "ALC",
        deliveryPlace: "Aeropuerto",
        deliveryAt: "2026-04-11T09:00:00",
        pickupBranch: "ALC",
        pickupPlace: "Aeropuerto",
        pickupAt: "2026-04-11T20:00:00",
        billedCarGroup: "A",
        assignedPlate: "1234ABC",
        billedDays: "1",
        reservationStatus: "PETICION",
        salesChannel: "DIRECTO",
        baseAmount: "50",
        totalPrice: "50",
      },
      ACTOR,
    );
    const secondReservation = (await readRentalData()).reservations.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    assert.ok(secondReservation?.id);
    await assert.rejects(
      () => convertReservationToContract(secondReservation.id, ACTOR),
      /Conflicto de solape al contratar/,
    );
    await convertReservationToContract(secondReservation.id, ACTOR, {
      overrideAccepted: "true",
      overrideReason: "Operación manual validada",
    });

    const invoices = await listInvoices("");
    assert.equal(invoices.length, 1);
    const invoice = invoices[0];

    // Facturación solo incluye base+extras+seguros+penalizaciones e IVA.
    assert.equal(Number(invoice.baseAmount.toFixed(2)), 100);
    assert.equal(Number(invoice.extrasAmount.toFixed(2)), 20);
    assert.equal(Number(invoice.insuranceAmount.toFixed(2)), 0);
    assert.equal(Number(invoice.penaltiesAmount.toFixed(2)), 0);
    assert.equal(Number(invoice.totalAmount.toFixed(2)), 145.2);

    // Gastos internos (contrato y diario) no modifican la factura.
    const expenses = await listExpenseJournal({ from: "2026-04-01", to: "2026-04-30", plate: "1234ABC" });
    assert.equal(expenses.rows.length, 2);
    const totalExpenses = expenses.rows.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(Number(totalExpenses.toFixed(2)), 21.5);

    // Producción sí incluye gastos internos y diarios.
    const prod = await getVehicleProductionSummary({ from: "2026-04-01T00:00:00", to: "2026-04-30T23:59:59" });
    const vehicleRow = prod.find((row) => row.plate === "1234ABC");
    assert.ok(vehicleRow);
    assert.equal(Number(vehicleRow.income.toFixed(2)), 165);
    assert.equal(Number(vehicleRow.expenses.toFixed(2)), 21.5);
    assert.equal(Number(vehicleRow.profitability.toFixed(2)), 143.5);

    console.log("OK test:flujo-core");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
