// Tipos de dominio del módulo de alquiler.
// Aquí se definen contratos de datos usados por UI, servicios y persistencia.
export type RoleName = "SUPER_ADMIN" | "ADMIN" | "LECTOR";

// Reserva comercial antes de convertirse en contrato.
export type Reservation = {
  id: string;
  reservationNumber: string;
  seriesCode: string;
  docType: string;
  contractType: string;
  billingAccountCode: string;
  commissionAccountCode: string;
  clientAccountCode: string;
  voucherNumber: string;
  branchDelivery: string;
  customerName: string;
  customerCompany: string;
  customerCommissioner: string;
  deliveryPlace: string;
  deliveryAt: string;
  pickupBranch: string;
  pickupPlace: string;
  pickupAt: string;
  deliveryFlightNumber: string;
  pickupFlightNumber: string;
  billedCarGroup: string;
  modelRequested: string;
  assignedPlate: string;
  vehicleKeyCode: string;
  billedDays: number;
  billedGroupOverride: string;
  assignedVehicleGroup: string;
  priceBreakdown: string;
  extrasBreakdown: string;
  baseAmount: number;
  discountAmount: number;
  extrasAmount: number;
  fuelAmount: number;
  insuranceAmount: number;
  penaltiesAmount: number;
  fuelPolicy: string;
  additionalDrivers: string;
  appliedRate: string;
  publicNotes: string;
  privateNotes: string;
  deductible: string;
  depositAmount: number;
  privateObservations: string;
  publicObservations: string;
  referenceCode: string;
  dnhcCode: string;
  blockPlateForReservation: boolean;
  paymentsMade: number;
  totalPrice: number;
  salesChannel: string;
  ivaPercent: number;
  createdAt: string;
  createdBy: string;
  contractId: string | null;
  reservationStatus: "PETICION" | "CONFIRMADA";
  groupOverrideAccepted: boolean;
  groupOverrideReason: string;
  groupOverridePriceAdjustment: number;
  groupOverridePriceAdjustedAt: string;
  confirmationSentLog: Array<{
    sentAt: string;
    sentBy: string;
    to: string;
    status: "ENVIADA" | "ERROR";
  }>;
  customerId: string | null;
};

// Cobro registrado sobre un contrato abierto.
export type CashRecord = {
  amount: number;
  method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO";
  cardLast4: string;
  notes: string;
  createdAt: string;
  createdBy: string;
};

// Gasto interno que no se factura al cliente final.
export type InternalExpense = {
  id: string;
  contractId: string;
  vehiclePlate: string;
  expenseDate: string;
  category: "PEAJE" | "GASOLINA" | "COMIDA" | "PARKING" | "LAVADO" | "OTRO";
  amount: number;
  note: string;
  createdAt: string;
  createdBy: string;
};

// Contrato operativo generado desde una reserva.
export type Contract = {
  id: string;
  contractNumber: string;
  reservationId: string;
  branchCode: string;
  customerName: string;
  companyName: string;
  deliveryAt: string;
  pickupAt: string;
  vehiclePlate: string;
  billedCarGroup: string;
  status: "ABIERTO" | "CERRADO";
  priceBreakdown: string;
  extrasBreakdown: string;
  baseAmount: number;
  discountAmount: number;
  extrasAmount: number;
  fuelAmount: number;
  insuranceAmount: number;
  penaltiesAmount: number;
  ivaPercent: number;
  paymentsMade: number;
  totalSettlement: number;
  deductible: string;
  additionalDrivers: string;
  privateNotes: string;
  cashRecord: CashRecord | null;
  internalExpenseIds: string[];
  checkOutAt: string | null;
  checkOutBy: string;
  checkOutKm: number;
  checkOutFuelLevel: string;
  checkOutNotes: string;
  checkOutPhotos: string;
  checkInAt: string | null;
  checkInBy: string;
  checkInKm: number;
  checkInFuelLevel: string;
  checkInNotes: string;
  checkInPhotos: string;
  createdAt: string;
  createdBy: string;
  closedAt: string | null;
  invoiceId: string | null;
};

export type VehicleTaskType = "LIMPIEZA" | "MANTENIMIENTO" | "ITV" | "REVISION";

export type VehicleTaskStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";

export type VehicleTask = {
  id: string;
  plate: string;
  taskType: VehicleTaskType;
  title: string;
  dueDate: string;
  status: VehicleTaskStatus;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// Factura emitida al cierre de contrato.
export type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceName: string;
  contractId: string;
  issuedAt: string;
  baseAmount: number;
  extrasAmount: number;
  insuranceAmount: number;
  penaltiesAmount: number;
  ivaPercent: number;
  ivaAmount: number;
  totalAmount: number;
  sentLog: Array<{ sentAt: string; sentBy: string; to: string; status: "ENVIADA" | "ERROR" }>;
};

// Plantilla HTML reusable para documentos.
export type TemplateDocument = {
  id: string;
  templateCode: string;
  templateType: "CONTRATO" | "CONFIRMACION_RESERVA" | "FACTURA";
  language: string;
  title: string;
  htmlContent: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// Bloqueo manual de vehículo en un intervalo.
export type VehicleBlock = {
  id: string;
  vehiclePlate: string;
  startAt: string;
  endAt: string;
  reason: string;
  createdAt: string;
  createdBy: string;
};

export type ClientType = "PARTICULAR" | "EMPRESA" | "COMISIONISTA";

// Maestro de clientes (particular, empresa o comisionista).
export type Client = {
  id: string;
  clientCode: string;
  clientType: ClientType;
  referenceCode: string;
  groupCode: string;
  gender: string;
  firstName: string;
  lastName: string;
  companyName: string;
  commissionerName: string;
  commissionPercent: number;
  nationality: string;
  language: string;
  documentType: string;
  documentNumber: string;
  documentIssuedAt: string;
  documentExpiresAt: string;
  licenseNumber: string;
  licenseType: string;
  licenseIssuedAt: string;
  licenseExpiresAt: string;
  email: string;
  phone1: string;
  phone2: string;
  birthDate: string;
  birthPlace: string;
  residenceAddress: string;
  vacationAddress: string;
  residenceStreet: string;
  residenceCity: string;
  residencePostalCode: string;
  residenceRegion: string;
  residenceCountry: string;
  vacationStreet: string;
  vacationCity: string;
  vacationPostalCode: string;
  vacationRegion: string;
  vacationCountry: string;
  acquisitionChannel: string;
  paymentMethod: string;
  paymentDay: string;
  saleWindowDay: string;
  contactPerson: string;
  web: string;
  bankChargeIban: string;
  bankChargeBic: string;
  bankAbonoIban: string;
  bankAbonoBic: string;
  branchBelongingCode: string;
  includeMailing: boolean;
  accountBlocked: boolean;
  notes: string;
  warnings: string;
  taxExemption: string;
  companyOwnDrivers: boolean;
  groupedBilling: boolean;
  isAffiliate: boolean;
  advanceMonthlyBilling: boolean;
  forceDeductibleCharge: boolean;
  taxId: string;
  fiscalAddress: string;
  associatedRate: string;
  companyDriverCompanyId: string;
  companyDrivers: string;
  createdAt: string;
  createdBy: string;
};

export type TariffPlan = {
  id: string;
  code: string;
  title: string;
  season: string;
  validFrom: string;
  validTo: string;
  priceMode: "PRECIO_A" | "PRECIO_B" | "PRECIO_C";
  active: boolean;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type TariffBracket = {
  id: string;
  tariffPlanId: string;
  label: string;
  fromDay: number;
  toDay: number;
  order: number;
  isExtraDay: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type TariffPrice = {
  id: string;
  tariffPlanId: string;
  groupCode: string;
  bracketId: string;
  price: number;
  maxKmPerDay: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// Catálogo de marca/modelo.
export type VehicleModel = {
  id: string;
  brand: string;
  model: string;
  transmission: "MANUAL" | "AUTOMATICO";
  features: string;
  fuelType: string;
  categoryId: string;
  createdAt: string;
  createdBy: string;
};

// Grupo/categoría comercial de vehículo.
export type VehicleCategory = {
  id: string;
  code: string;
  name: string;
  summary: string;
  transmissionRequired: "MANUAL" | "AUTOMATICO";
  minSeats: number;
  minDoors: number;
  minLuggage: number;
  fuelType: string;
  airConditioning: boolean;
  insurancePrice: number;
  deductiblePrice: number;
  depositPrice: number;
  createdAt: string;
  createdBy: string;
};

// Activo físico de flota.
export type FleetVehicle = {
  id: string;
  plate: string;
  modelId: string;
  categoryId: string;
  owner: string;
  color: string;
  year: number;
  vin: string;
  odometerKm: number;
  fuelType: string;
  activeFrom: string;
  activeUntil: string;
  acquisitionCost: number;
  alertNotes: string;
  deactivatedAt: string;
  deactivationReason: string;
  deactivationAmount: number;
  createdAt: string;
  createdBy: string;
};

export type VehicleExtra = {
  id: string;
  code: string;
  name: string;
  priceMode: "FIJO" | "POR_DIA";
  unitPrice: number;
  maxDays: number;
  active: boolean;
  createdAt: string;
  createdBy: string;
};

export type CompanyBranch = {
  code: string;
  name: string;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: RoleName;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// Configuración global de empresa (fiscal, series y sucursales).
export type CompanySettings = {
  companyName: string;
  companyEmailFrom: string;
  taxId: string;
  fiscalAddress: string;
  defaultIvaPercent: number;
  salesChannels: string[];
  providers: string[];
  backupRetentionDays: number;
  invoiceSeriesByType: {
    F: string;
    R: string;
    V: string;
    A: string;
  };
  branches: CompanyBranch[];
  contractNumberPattern: "aa-sucursal-numero";
  invoiceNumberPattern: "aa-sucursal-numero";
  updatedAt: string;
  updatedBy: string;
};

// Snapshot completo del almacén local.
export type RentalData = {
  reservations: Reservation[];
  contracts: Contract[];
  invoices: Invoice[];
  internalExpenses: InternalExpense[];
  vehicleBlocks: VehicleBlock[];
  templates: TemplateDocument[];
  clients: Client[];
  vehicleModels: VehicleModel[];
  vehicleCategories: VehicleCategory[];
  fleetVehicles: FleetVehicle[];
  vehicleExtras: VehicleExtra[];
  vehicleTasks: VehicleTask[];
  tariffPlans: TariffPlan[];
  tariffBrackets: TariffBracket[];
  tariffPrices: TariffPrice[];
  users: UserAccount[];
  companySettings: CompanySettings;
  counters: {
    reservation: number;
    client: number;
    contractByYearBranch: Record<string, number>;
    invoiceByYearBranch: Record<string, number>;
  };
};
