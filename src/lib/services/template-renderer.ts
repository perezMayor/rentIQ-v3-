// Servicio de negocio para template renderer.
import type { Client, Reservation } from "@/lib/domain/rental";

function formatMoney(value: number, language: string): string {
  const locale = language.toLowerCase().startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function formatDate(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  const locale = language.toLowerCase().startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language.toLowerCase().startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatDateTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  const locale = language.toLowerCase().startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function parseExtras(extrasBreakdown: string) {
  const rows = extrasBreakdown
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("=");
      const left = (parts[0] ?? "").trim();
      const total = Number(parts[1]?.trim() ?? "0");
      const firstColon = left.indexOf(":");
      const header = firstColon >= 0 ? left.slice(firstColon + 1).trim() : left;
      const namePart = header.split(" x")[0]?.trim() ?? "";
      const unitMatch = header.match(/x(\d+)/i);
      const units = unitMatch ? Number(unitMatch[1]) : 1;
      const unitPrice = units > 0 ? total / units : total;
      return { name: namePart || "Extra", units, unitPrice, total };
    });
  return rows.slice(0, 6);
}

export function renderTemplateWithMacros(template: string, data: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_#@.]+)\s*\}\}|\{([a-zA-Z0-9_#@.]+)\}/g, (_full, keyDouble: string, keySingle: string) => {
    const key = (keyDouble || keySingle || "").trim();
    return data[key] ?? "";
  });
}

export function buildBudgetTemplateData(input: {
  language: string;
  company: {
    name: string;
    taxId: string;
    fiscalAddress: string;
    emailFrom: string;
    phone: string;
    website: string;
    footer: string;
    logoDataUrl: string;
    brandPrimaryColor: string;
    brandSecondaryColor: string;
  };
  budget: {
    deliveryAt: string;
    deliveryPlace: string;
    pickupAt: string;
    pickupPlace: string;
    billedCarGroup: string;
    billedDays: number;
    appliedRate: string;
    baseAmount: number;
    discountAmount: number;
    insuranceAmount: number;
    extrasAmount: number;
    fuelAmount: number;
    totalAmount: number;
    extrasBreakdown: string;
  };
}) {
  const { company, budget } = input;
  const language = input.language.toLowerCase();
  const extras = parseExtras(budget.extrasBreakdown || "");
  const data: Record<string, string> = {
    company_name: company.name,
    company_document_name: company.name,
    company_tax_id: company.taxId,
    company_fiscal_address: company.fiscalAddress,
    company_email_from: company.emailFrom,
    company_phone: company.phone,
    company_website: company.website,
    company_document_footer: company.footer,
    company_logo_data_url: company.logoDataUrl,
    company_brand_primary_color: company.brandPrimaryColor,
    company_brand_secondary_color: company.brandSecondaryColor,
    delivery_at: budget.deliveryAt || "",
    delivery_date: formatDate(budget.deliveryAt, language),
    delivery_time: formatTime(budget.deliveryAt, language),
    delivery_place: budget.deliveryPlace || "",
    pickup_at: budget.pickupAt || "",
    pickup_date: formatDate(budget.pickupAt, language),
    pickup_time: formatTime(budget.pickupAt, language),
    pickup_place: budget.pickupPlace || "",
    billed_car_group: budget.billedCarGroup || "",
    billed_days: String(budget.billedDays || 1),
    applied_rate: budget.appliedRate || "",
    base_amount: formatMoney(budget.baseAmount, language),
    discount_amount: formatMoney(budget.discountAmount, language),
    insurance_amount: formatMoney(budget.insuranceAmount, language),
    extras_amount: formatMoney(budget.extrasAmount, language),
    fuel_amount: formatMoney(budget.fuelAmount, language),
    total_amount: formatMoney(budget.totalAmount, language),
  };
  for (let i = 1; i <= 6; i += 1) {
    const row = extras[i - 1];
    const key = String(i).padStart(2, "0");
    data[`extra#${key}`] = row?.name ?? "";
    data[`extra#${key}unit`] = row?.units ? String(row.units) : "";
    data[`extra#${key}price`] = row ? formatMoney(row.unitPrice, language) : "";
    data[`extra#${key}total`] = row ? formatMoney(row.total, language) : "";
  }
  return data;
}

export function getBudgetBaseTemplate(language: string) {
  const isEn = language.toLowerCase().startsWith("en");
  const title = isEn ? "Quotation" : "Presupuesto";
  return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:900px;margin:0 auto;padding:16px;">
  <h2 style="margin:0 0 6px 0;color:#0f172a;">${title}</h2>
  <p style="margin:0 0 12px 0;color:#475569;">{{company_document_name}}</p>
  <div style="display:grid;gap:12px;">
    <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
      <p><strong>${isEn ? "Delivery" : "Entrega"}:</strong> {{delivery_date}} {{delivery_time}} · {{delivery_place}}</p>
      <p><strong>${isEn ? "Return" : "Recogida"}:</strong> {{pickup_date}} {{pickup_time}} · {{pickup_place}}</p>
      <p><strong>${isEn ? "Tariff" : "Tarifa"}:</strong> {{applied_rate}}</p>
      <p><strong>${isEn ? "Group" : "Grupo"}:</strong> {{billed_car_group}}</p>
      <p><strong>${isEn ? "Billed days" : "Días facturados"}:</strong> {{billed_days}}</p>
    </div>
    <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
      <p><strong>${isEn ? "Rent" : "Alquiler"}:</strong> {{base_amount}}</p>
      <p><strong>${isEn ? "Discount" : "Descuento"}:</strong> {{discount_amount}}</p>
      <p><strong>${isEn ? "Insurance" : "Seguros"}:</strong> {{insurance_amount}}</p>
      <p><strong>${isEn ? "Extras" : "Extras"}:</strong> {{extras_amount}}</p>
      <p><strong>${isEn ? "Fuel" : "Combustible"}:</strong> {{fuel_amount}}</p>
      <p><strong>${isEn ? "Total" : "Total"}:</strong> {{total_amount}}</p>
    </div>
  </div>
  <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #94a3b8;color:#475569;font-size:12px;">{{company_document_footer}}</div>
</section>
  `.trim();
}

export function buildReservationTemplateData(input: {
  language: string;
  reservation: Reservation;
  customer: Client | null;
  company: {
    name: string;
    taxId: string;
    fiscalAddress: string;
    emailFrom: string;
    phone: string;
    website: string;
    footer: string;
    logoDataUrl: string;
    brandPrimaryColor: string;
    brandSecondaryColor: string;
  };
}) {
  const { reservation, customer, company } = input;
  const language = input.language.toLowerCase();
  const extras = parseExtras(reservation.extrasBreakdown || "");
  const billedDays = reservation.billedDays > 0 ? reservation.billedDays : 1;
  const observations = [reservation.publicObservations, reservation.privateObservations].filter(Boolean).join(" | ");
  const flight = reservation.deliveryFlightNumber || reservation.pickupFlightNumber || "";

  const data: Record<string, string> = {
    company_name: company.name,
    company_document_name: company.name,
    company_tax_id: company.taxId,
    company_fiscal_address: company.fiscalAddress,
    company_email_from: company.emailFrom,
    company_phone: company.phone,
    company_website: company.website,
    company_document_footer: company.footer,
    company_logo_data_url: company.logoDataUrl,
    company_brand_primary_color: company.brandPrimaryColor,
    company_brand_secondary_color: company.brandSecondaryColor,
    reservation_number: reservation.reservationNumber,
    customer_name: reservation.customerName || customer?.firstName || customer?.companyName || "N/D",
    customer_email: customer?.email || "",
    customer_phone: customer?.phone1 || "",
    delivery_at: reservation.deliveryAt || "",
    delivery_date: formatDate(reservation.deliveryAt, language),
    delivery_time: formatTime(reservation.deliveryAt, language),
    delivery_place: reservation.deliveryPlace || "",
    pickup_at: reservation.pickupAt || "",
    pickup_date: formatDate(reservation.pickupAt, language),
    pickup_time: formatTime(reservation.pickupAt, language),
    pickup_place: reservation.pickupPlace || "",
    billed_car_group: reservation.billedCarGroup || "",
    assigned_plate: reservation.assignedPlate || "",
    total_amount: formatMoney(reservation.totalPrice, language),
    sales_channel: reservation.salesChannel || "",
    base_amount: formatMoney(reservation.baseAmount, language),
    extras_amount: formatMoney(reservation.extrasAmount, language),
    fuel_amount: formatMoney(reservation.fuelAmount, language),
    discount_amount: formatMoney(reservation.discountAmount, language),
    insurance_amount: formatMoney(reservation.insuranceAmount, language),
    deductible: reservation.deductible || "N/D",
    billed_days: String(billedDays),
    observations: observations || "",
    delivery_flight_number: flight,

    resNum: reservation.reservationNumber,
    docNum: reservation.reservationNumber,
    conductorNombre: reservation.customerName || customer?.firstName || customer?.companyName || "N/D",
    driver: reservation.customerName || customer?.firstName || customer?.companyName || "N/D",
    eFechaHora: formatDateTime(reservation.deliveryAt, language),
    eFecha: formatDate(reservation.deliveryAt, language),
    eHora: formatTime(reservation.deliveryAt, language),
    eLugar: reservation.deliveryPlace || "",
    vuelo: flight,
    conductorVuelo: flight,
    rFechaHora: formatDateTime(reservation.pickupAt, language),
    rFecha: formatDate(reservation.pickupAt, language),
    rHora: formatTime(reservation.pickupAt, language),
    rLugar: reservation.pickupPlace || "",
    grupo: reservation.billedCarGroup || "",
    grupoFac: reservation.billedCarGroup || "",
    dias: String(billedDays),
    ocupacion: formatMoney(reservation.baseAmount, language),
    extras: formatMoney(reservation.extrasAmount, language),
    combustible: formatMoney(reservation.fuelAmount, language),
    importe: formatMoney(reservation.totalPrice, language),
    franquicia: reservation.deductible || "N/D",
    obs: observations || "",
    conductorObs: observations || "",
    email: customer?.email || "",
    phone: customer?.phone1 || "",
    usuario: "",
    "correo@dominio.com": company.emailFrom,
  };

  for (let i = 1; i <= 6; i += 1) {
    const row = extras[i - 1];
    const key = String(i).padStart(2, "0");
    data[`extra#${key}`] = row?.name ?? "";
    data[`extra#${key}unit`] = row?.units ? String(row.units) : "";
    data[`extra#${key}price`] = row ? formatMoney(row.unitPrice, language) : "";
    data[`extra#${key}total`] = row ? formatMoney(row.total, language) : "";
  }

  return data;
}

export function getReservationBaseTemplate(language: string) {
  const isEn = language.toLowerCase().startsWith("en");
  const title = isEn ? "Booking confirmation" : "Confirmación de reserva";
  const sectionBooking = isEn ? "Booking information" : "Información de reserva";
  const sectionQuote = isEn ? "Quote" : "Cotización";
  const labelName = isEn ? "Name" : "Nombre";
  const labelGroup = isEn ? "Group" : "Grupo";
  const labelPickup = isEn ? "Pick up" : "Entrega";
  const labelFlight = isEn ? "Flight" : "Vuelo";
  const labelDropoff = isEn ? "Delivery" : "Devolución";
  const labelDays = isEn ? "Day(s)" : "Día(s)";
  const labelObs = isEn ? "Remarks" : "Observaciones";
  const labelRent = isEn ? "Rent" : "Alquiler";
  const labelFuel = isEn ? "Fuel" : "Combustible";
  const labelTotal = isEn ? "Total" : "Total";
  const labelDeductible = isEn ? "Excess" : "Franquicia";
  return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:900px;margin:0 auto;padding:16px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #dbe4f1;padding-bottom:8px;margin-bottom:12px;">
    <div>
      <h2 style="margin:0;color:#0f172a;">${title} {{reservation_number}}</h2>
      <p style="margin:6px 0 0 0;color:#475569;">{{company_document_name}}</p>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
      <h3 style="margin:0 0 10px 0;font-size:15px;color:#1d4ed8;">${sectionBooking}</h3>
      <p><strong>${labelName}:</strong> {conductorNombre}</p>
      <p><strong>${labelGroup}:</strong> {grupoFac}</p>
      <p><strong>${labelPickup}:</strong> {eLugar} - {eFechaHora}</p>
      <p><strong>${labelFlight}:</strong> {conductorVuelo}</p>
      <p><strong>${labelDropoff}:</strong> {rLugar} - {rFechaHora}</p>
      <p><strong>${labelDays}:</strong> {dias}</p>
      <p><strong>${labelObs}:</strong> {conductorObs}</p>
    </div>
    <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
      <h3 style="margin:0 0 10px 0;font-size:15px;color:#1d4ed8;">${sectionQuote}</h3>
      <p><strong>${labelRent}:</strong> {ocupacion}</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td>{extra#01unit}</td><td>{extra#01}</td><td style="text-align:right;">{extra#01total}</td></tr>
        <tr><td>{extra#02unit}</td><td>{extra#02}</td><td style="text-align:right;">{extra#02total}</td></tr>
        <tr><td>{extra#03unit}</td><td>{extra#03}</td><td style="text-align:right;">{extra#03total}</td></tr>
        <tr><td>{extra#04unit}</td><td>{extra#04}</td><td style="text-align:right;">{extra#04total}</td></tr>
        <tr><td>{extra#05unit}</td><td>{extra#05}</td><td style="text-align:right;">{extra#05total}</td></tr>
        <tr><td>{extra#06unit}</td><td>{extra#06}</td><td style="text-align:right;">{extra#06total}</td></tr>
      </table>
      <p><strong>${labelFuel}:</strong> {combustible}</p>
      <p><strong>${labelTotal}:</strong> {importe}</p>
      <p><strong>${labelDeductible}:</strong> {franquicia}</p>
    </div>
  </div>
  <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #94a3b8;color:#475569;font-size:12px;">
    {{company_document_footer}}
  </div>
</section>
  `.trim();
}
