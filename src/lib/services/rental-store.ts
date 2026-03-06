import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/data-dir";
import type { Client, Contract, FleetVehicle, Invoice, RentalData, Reservation, VehicleCategory, VehicleModel } from "@/lib/domain/rental";

// Estructura inicial del almacén local cuando aún no existe fichero persistido.
const defaultData: RentalData = {
  reservations: [],
  contracts: [],
  invoices: [],
  internalExpenses: [],
  vehicleBlocks: [],
  templates: [],
  clients: [],
  vehicleModels: [],
  vehicleCategories: [],
  fleetVehicles: [],
  vehicleExtras: [],
  vehicleTasks: [],
  tariffPlans: [],
  tariffBrackets: [],
  tariffPrices: [],
  users: [],
  companySettings: {
    companyName: "N/D",
    legalName: "N/D",
    documentBrandName: "N/D",
    companyEmailFrom: "N/D",
    companyPhone: "N/D",
    companyWebsite: "N/D",
    taxId: "N/D",
    fiscalAddress: "N/D",
    documentFooter: "",
    contractFrontFooter: "",
    contractBackContent: "",
    contractBackContentType: "TEXT",
    logoDataUrl: "",
    brandPrimaryColor: "#2563eb",
    brandSecondaryColor: "#0f172a",
    defaultIvaPercent: 21,
    salesChannels: [],
    providers: [],
    backupRetentionDays: 90,
    invoiceSeriesByType: { F: "F", R: "R", V: "V", A: "A" },
    invoiceNumberScope: "BRANCH",
    branches: [],
    branchSchedules: {},
    contractNumberPattern: "aa-sucursal-numero",
    invoiceNumberPattern: "serie-digitos-sucursal",
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  counters: {
    reservation: 0,
    client: 0,
    contractByYearBranch: {},
    invoiceByYearBranch: {},
  },
};

function getStorePath() {
  return path.join(getDataDir(), "rental-store.json");
}

// Carga datos del store y normaliza campos para mantener compatibilidad entre versiones.
export async function readRentalData(): Promise<RentalData> {
  const filePath = getStorePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RentalData>;
    const reservations = (parsed.reservations ?? []).map((reservation) => normalizeReservation(reservation as Reservation));
    const clients = (parsed.clients ?? []).map((client) => normalizeClient(client as Client));
    const vehicleModels = (parsed.vehicleModels ?? []).map((model) => normalizeVehicleModel(model as VehicleModel));
    const vehicleCategories = (parsed.vehicleCategories ?? []).map((category) =>
      normalizeVehicleCategory(category as VehicleCategory),
    );
    const fleetVehicles = (parsed.fleetVehicles ?? []).map((vehicle) => normalizeFleetVehicle(vehicle as FleetVehicle));
    const contracts = (parsed.contracts ?? []).map((contract) => normalizeContract(contract as Contract));
    const invoices = (parsed.invoices ?? []).map((invoice) => normalizeInvoice(invoice as Invoice));
    return {
      reservations,
      contracts,
      invoices,
      internalExpenses: parsed.internalExpenses ?? [],
      vehicleBlocks: parsed.vehicleBlocks ?? [],
      templates: parsed.templates ?? [],
      clients,
      vehicleModels,
      vehicleCategories,
      fleetVehicles,
      vehicleExtras: parsed.vehicleExtras ?? [],
      vehicleTasks: parsed.vehicleTasks ?? [],
      tariffPlans: parsed.tariffPlans ?? [],
      tariffBrackets: parsed.tariffBrackets ?? [],
      tariffPrices: parsed.tariffPrices ?? [],
      users: parsed.users ?? [],
      companySettings: {
        companyName: parsed.companySettings?.companyName ?? "N/D",
        legalName: parsed.companySettings?.legalName ?? parsed.companySettings?.companyName ?? "N/D",
        documentBrandName: parsed.companySettings?.documentBrandName ?? parsed.companySettings?.companyName ?? "N/D",
        companyEmailFrom: parsed.companySettings?.companyEmailFrom ?? "N/D",
        companyPhone: parsed.companySettings?.companyPhone ?? "N/D",
        companyWebsite: parsed.companySettings?.companyWebsite ?? "N/D",
        taxId: parsed.companySettings?.taxId ?? "N/D",
        fiscalAddress: parsed.companySettings?.fiscalAddress ?? "N/D",
        documentFooter: parsed.companySettings?.documentFooter ?? "",
        contractFrontFooter: parsed.companySettings?.contractFrontFooter ?? parsed.companySettings?.documentFooter ?? "",
        contractBackContent: parsed.companySettings?.contractBackContent ?? "",
        contractBackContentType: parsed.companySettings?.contractBackContentType === "HTML" ? "HTML" : "TEXT",
        logoDataUrl: parsed.companySettings?.logoDataUrl ?? "",
        brandPrimaryColor: parsed.companySettings?.brandPrimaryColor ?? "#2563eb",
        brandSecondaryColor: parsed.companySettings?.brandSecondaryColor ?? "#0f172a",
        defaultIvaPercent: parsed.companySettings?.defaultIvaPercent ?? 21,
        salesChannels: parsed.companySettings?.salesChannels ?? [],
        providers: parsed.companySettings?.providers ?? [],
        backupRetentionDays: parsed.companySettings?.backupRetentionDays ?? 90,
        invoiceSeriesByType: {
          F: parsed.companySettings?.invoiceSeriesByType?.F ?? "F",
          R: parsed.companySettings?.invoiceSeriesByType?.R ?? "R",
          V: parsed.companySettings?.invoiceSeriesByType?.V ?? "V",
          A: parsed.companySettings?.invoiceSeriesByType?.A ?? "A",
        },
        invoiceNumberScope: parsed.companySettings?.invoiceNumberScope === "GLOBAL" ? "GLOBAL" : "BRANCH",
        branches: parsed.companySettings?.branches ?? [],
        branchSchedules: parsed.companySettings?.branchSchedules ?? {},
        contractNumberPattern: "aa-sucursal-numero",
        invoiceNumberPattern:
          parsed.companySettings?.invoiceNumberPattern === "serie-digitos-global"
            ? "serie-digitos-global"
            : "serie-digitos-sucursal",
        updatedAt: parsed.companySettings?.updatedAt ?? new Date().toISOString(),
        updatedBy: parsed.companySettings?.updatedBy ?? "system",
      },
      counters: {
        reservation: parsed.counters?.reservation ?? 0,
        client: parsed.counters?.client ?? 0,
        contractByYearBranch: parsed.counters?.contractByYearBranch ?? {},
        invoiceByYearBranch: parsed.counters?.invoiceByYearBranch ?? {},
      },
    };
  } catch {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(defaultData, null, 2), "utf8");
    return defaultData;
  }
}

function normalizeVehicleModel(model: VehicleModel): VehicleModel {
  return {
    ...model,
    fuelType: model.fuelType ?? "",
    categoryId: model.categoryId ?? "",
  };
}

function normalizeContract(contract: Contract): Contract {
  return {
    ...contract,
    baseAmount: contract.baseAmount ?? 0,
    discountAmount: contract.discountAmount ?? 0,
    extrasAmount: contract.extrasAmount ?? 0,
    fuelAmount: contract.fuelAmount ?? 0,
    insuranceAmount: contract.insuranceAmount ?? 0,
    penaltiesAmount: contract.penaltiesAmount ?? 0,
    ivaPercent: contract.ivaPercent ?? 21,
    checkOutAt: contract.checkOutAt ?? null,
    checkOutBy: contract.checkOutBy ?? "",
    checkOutKm: contract.checkOutKm ?? 0,
    checkOutFuelLevel: contract.checkOutFuelLevel ?? "",
    checkOutNotes: contract.checkOutNotes ?? "",
    checkOutPhotos: contract.checkOutPhotos ?? "",
    checkOutSignatureName: contract.checkOutSignatureName ?? "",
    checkOutSignatureHash: contract.checkOutSignatureHash ?? "",
    checkOutSignatureDevice: contract.checkOutSignatureDevice ?? "",
    checkInAt: contract.checkInAt ?? null,
    checkInBy: contract.checkInBy ?? "",
    checkInKm: contract.checkInKm ?? 0,
    checkInFuelLevel: contract.checkInFuelLevel ?? "",
    checkInNotes: contract.checkInNotes ?? "",
    checkInPhotos: contract.checkInPhotos ?? "",
    checkInSignatureName: contract.checkInSignatureName ?? "",
    checkInSignatureHash: contract.checkInSignatureHash ?? "",
    checkInSignatureDevice: contract.checkInSignatureDevice ?? "",
  };
}

function normalizeInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    sourceType: invoice.sourceType === "MANUAL" ? "MANUAL" : "CONTRATO",
    invoiceType:
      invoice.invoiceType === "V" || invoice.invoiceType === "R" || invoice.invoiceType === "A" ? invoice.invoiceType : "F",
    contractId: invoice.contractId ?? null,
    sourceInvoiceId: invoice.sourceInvoiceId ?? null,
    manualCustomerName: invoice.manualCustomerName ?? "",
    manualCustomerTaxId: invoice.manualCustomerTaxId ?? "",
    manualCustomerAddress: invoice.manualCustomerAddress ?? "",
    manualCustomerEmail: invoice.manualCustomerEmail ?? "",
    manualLanguage: invoice.manualLanguage ?? "",
    status: invoice.status === "FINAL" ? "FINAL" : "BORRADOR",
    finalizedAt: invoice.finalizedAt ?? null,
    finalizedBy: invoice.finalizedBy ?? "",
  };
}

// Compatibilidad hacia atrás para reservas antiguas sin campos nuevos.
function normalizeReservation(reservation: Reservation): Reservation {
  return {
    ...reservation,
    seriesCode: reservation.seriesCode ?? "01",
    docType: reservation.docType ?? "RESERVA",
    contractType: reservation.contractType ?? "STANDARD",
    billingAccountCode: reservation.billingAccountCode ?? "",
    commissionAccountCode: reservation.commissionAccountCode ?? "",
    clientAccountCode: reservation.clientAccountCode ?? "",
    voucherNumber: reservation.voucherNumber ?? "",
    reservationStatus: reservation.reservationStatus ?? "CONFIRMADA",
    modelRequested: reservation.modelRequested ?? "",
    vehicleKeyCode: reservation.vehicleKeyCode ?? "",
    billedDays: reservation.billedDays ?? 0,
    billedGroupOverride: reservation.billedGroupOverride ?? "",
    assignedVehicleGroup: reservation.assignedVehicleGroup ?? "",
    baseAmount: reservation.baseAmount ?? 0,
    discountAmount: reservation.discountAmount ?? 0,
    extrasAmount: reservation.extrasAmount ?? 0,
    fuelAmount: reservation.fuelAmount ?? 0,
    insuranceAmount: reservation.insuranceAmount ?? 0,
    penaltiesAmount: reservation.penaltiesAmount ?? 0,
    depositAmount: reservation.depositAmount ?? 0,
    privateObservations: reservation.privateObservations ?? "",
    publicObservations: reservation.publicObservations ?? "",
    referenceCode: reservation.referenceCode ?? "",
    dnhcCode: reservation.dnhcCode ?? "",
    blockPlateForReservation: reservation.blockPlateForReservation ?? false,
    groupOverrideAccepted: reservation.groupOverrideAccepted ?? false,
    groupOverrideReason: reservation.groupOverrideReason ?? "",
    groupOverridePriceAdjustment: reservation.groupOverridePriceAdjustment ?? 0,
    groupOverridePriceAdjustedAt: reservation.groupOverridePriceAdjustedAt ?? "",
    confirmationSentLog: reservation.confirmationSentLog ?? [],
    customerId: reservation.customerId ?? null,
  };
}

// Completa campos de dirección y choferes corporativos en clientes históricos.
function normalizeClient(client: Client): Client {
  return {
    ...client,
    referenceCode: client.referenceCode ?? "",
    groupCode: client.groupCode ?? "",
    gender: client.gender ?? "",
    residenceStreet: client.residenceStreet ?? "",
    residenceCity: client.residenceCity ?? "",
    residencePostalCode: client.residencePostalCode ?? "",
    residenceRegion: client.residenceRegion ?? "",
    residenceCountry: client.residenceCountry ?? "",
    vacationStreet: client.vacationStreet ?? "",
    vacationCity: client.vacationCity ?? "",
    vacationPostalCode: client.vacationPostalCode ?? "",
    vacationRegion: client.vacationRegion ?? "",
    vacationCountry: client.vacationCountry ?? "",
    paymentMethod: client.paymentMethod ?? "",
    paymentDay: client.paymentDay ?? "",
    saleWindowDay: client.saleWindowDay ?? "",
    contactPerson: client.contactPerson ?? "",
    web: client.web ?? "",
    bankChargeIban: client.bankChargeIban ?? "",
    bankChargeBic: client.bankChargeBic ?? "",
    bankAbonoIban: client.bankAbonoIban ?? "",
    bankAbonoBic: client.bankAbonoBic ?? "",
    branchBelongingCode: client.branchBelongingCode ?? "",
    includeMailing: client.includeMailing ?? false,
    accountBlocked: client.accountBlocked ?? false,
    notes: client.notes ?? "",
    warnings: client.warnings ?? "",
    taxExemption: client.taxExemption ?? "",
    companyOwnDrivers: client.companyOwnDrivers ?? false,
    groupedBilling: client.groupedBilling ?? false,
    isAffiliate: client.isAffiliate ?? false,
    advanceMonthlyBilling: client.advanceMonthlyBilling ?? false,
    forceDeductibleCharge: client.forceDeductibleCharge ?? false,
    licenseType: client.licenseType ?? "",
    commissionPercent: client.commissionPercent ?? 0,
    companyDrivers: client.companyDrivers ?? "",
  };
}

// Completa atributos técnicos de categorías que no existían en versiones previas.
function normalizeVehicleCategory(category: VehicleCategory): VehicleCategory {
  return {
    ...category,
    minSeats: category.minSeats ?? 0,
    minDoors: category.minDoors ?? 0,
    minLuggage: category.minLuggage ?? 0,
    fuelType: category.fuelType ?? "",
    airConditioning: category.airConditioning ?? false,
    insurancePrice: category.insurancePrice ?? 0,
    deductiblePrice: category.deductiblePrice ?? 0,
    depositPrice: category.depositPrice ?? 0,
  };
}

// Completa atributos mecánicos/estado en vehículos de flota antiguos.
function normalizeFleetVehicle(vehicle: FleetVehicle): FleetVehicle {
  return {
    ...vehicle,
    color: vehicle.color ?? "",
    year: vehicle.year ?? 0,
    vin: vehicle.vin ?? "",
    odometerKm: vehicle.odometerKm ?? 0,
    fuelType: vehicle.fuelType ?? "",
    alertNotes: vehicle.alertNotes ?? "",
    deactivatedAt: vehicle.deactivatedAt ?? "",
    deactivationReason: vehicle.deactivationReason ?? "",
    deactivationAmount: vehicle.deactivationAmount ?? 0,
  };
}

// Persistencia completa del estado de negocio en disco.
export async function writeRentalData(data: RentalData): Promise<void> {
  const filePath = getStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
