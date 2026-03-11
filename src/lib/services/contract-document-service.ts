import PDFDocument from "pdfkit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { readAuditEventsByContract } from "@/lib/audit";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { applyPdfkitFontFallback, ensurePdfkitFontCompat } from "@/lib/pdfkit-compat";
import type { Contract, RentalData, Reservation, TemplateDocument } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type ContractDocument = {
  contract: Contract;
  language: string;
  templateUsed: TemplateDocument | null;
  html: string;
  pdfBuffer: Buffer;
};

type CopyType = "EMPRESA" | "CLIENTE";

type VehicleChangeRow = {
  when: string;
  fromPlate: string;
  toPlate: string;
  reason: string;
};

type PriceBreakdownRow = {
  label: string;
  value: string;
};

type CustomerBoxData = {
  customerName: string;
  document: string;
  documentIssuedAt: string;
  documentExpiry: string;
  drivingLicense: string;
  drivingLicenseIssuedAt: string;
  drivingLicenseExpiry: string;
  nationality: string;
  birthDate: string;
  birthPlace: string;
  permanentAddressLines: string[];
  localAddressLines: string[];
  phone1: string;
  phone2: string;
};

type ContractI18n = {
  contractTitle: string;
  copyLabel: string;
  companyCopy: string;
  customerCopy: string;
  vehicleDataTitle: string;
  rentalDataTitle: string;
  mainDriverTitle: string;
  linkedCompanyTitle: string;
  technicalTitle: string;
  priceBreakdownTitle: string;
  additionalDriversTitle: string;
  vehicleChangesTitle: string;
  observationsTitle: string;
  tenantSignatureLabel: string;
  companySignatureLabel: string;
  noData: string;
  noAdditionalDrivers: string;
  noVehicleChanges: string;
  noObservations: string;
  backConditionsTitle: string;
  backConditionsFallback: string;
  frontFooterFormat: string;
  htmlSummaryFormat: string;
    labels: {
      vehicle: string;
      brandModel: string;
      delivery: string;
      pickup: string;
      deliveryPlace: string;
      deliveryDate: string;
      deliveryTime: string;
      deliveryFlight: string;
      pickupPlace: string;
      pickupDate: string;
      pickupTime: string;
      pickupFlight: string;
      rentedGroup: string;
      billedGroup: string;
      deliveredGroup: string;
      plate: string;
      color: string;
      fuelType: string;
      branch: string;
      customer: string;
      document: string;
      drivingLicense: string;
      drivingLicenseExpiry: string;
      documentExpiry: string;
      nationality: string;
      permanentAddress: string;
      localAddress: string;
      phone: string;
      company: string;
    taxId: string;
    fiscalAddress: string;
    contact: string;
    billedDays: string;
    rentedBilledGroup: string;
    tariffCode: string;
    maxKmPerDay: string;
    extraKmPrice: string;
    deductible: string;
  };
  priceLabels: Record<string, string>;
};

function getContractI18n(language: string): ContractI18n {
  const lang = language.toLowerCase();
  if (lang.startsWith("en")) {
    return {
      contractTitle: "Rental contract",
      copyLabel: "COPY",
      companyCopy: "COMPANY",
      customerCopy: "CUSTOMER",
      vehicleDataTitle: "Vehicle data",
      rentalDataTitle: "Rental details",
      mainDriverTitle: "Main driver",
      linkedCompanyTitle: "Company",
      technicalTitle: "Technical billing data",
      priceBreakdownTitle: "Billing breakdown",
      additionalDriversTitle: "Additional drivers",
      vehicleChangesTitle: "Vehicle changes",
      observationsTitle: "Observations",
      tenantSignatureLabel: "Renter signature",
      companySignatureLabel: "Company signature",
      noData: "N/A",
      noAdditionalDrivers: "No additional drivers",
      noVehicleChanges: "No vehicle changes recorded",
      noObservations: "No observations",
      backConditionsTitle: "Contract terms and conditions",
      backConditionsFallback: "Area for contract terms and conditions.",
      frontFooterFormat: "Footer",
      htmlSummaryFormat: "Format: front+back, two copies (company and customer).",
      labels: {
        vehicle: "Vehicle",
        brandModel: "Brand / model",
        delivery: "Delivery",
        pickup: "Return",
        deliveryPlace: "Delivery place",
        deliveryDate: "Delivery date",
        deliveryTime: "Delivery time",
        deliveryFlight: "Delivery flight",
        pickupPlace: "Return place",
        pickupDate: "Return date",
        pickupTime: "Return time",
        pickupFlight: "Return flight",
        rentedGroup: "Rented group",
        billedGroup: "Billed group",
      deliveredGroup: "Group",
        plate: "Plate",
        color: "Color",
        fuelType: "Fuel type",
        branch: "Branch",
        customer: "Customer",
        document: "Document",
        drivingLicense: "Driving license",
        drivingLicenseExpiry: "Driving license expiry",
        documentExpiry: "Document expiry",
        nationality: "Nationality",
        permanentAddress: "Permanent address",
        localAddress: "Local address",
        phone: "Phone",
        company: "Company",
        taxId: "Tax ID",
        fiscalAddress: "Fiscal address",
        contact: "Contact",
        billedDays: "Total billed days",
        rentedBilledGroup: "Billed / delivered group",
        tariffCode: "Tariff code",
        maxKmPerDay: "Maximum km per day",
        extraKmPrice: "Extra km price",
        deductible: "Deductible",
      },
      priceLabels: {
        base: "Base",
        descuento: "Discount",
        discount: "Discount",
        extras: "Extras",
        combustible: "Fuel",
        fuel: "Fuel",
        seguro: "Insurance",
        insurance: "Insurance",
        cdw: "CDW",
        extension: "Extension",
        penal: "Penalties",
        penalties: "Penalties",
        total: "Total",
      },
    };
  }
  return {
    contractTitle: "Contrato de alquiler",
    copyLabel: "COPIA",
    companyCopy: "EMPRESA",
    customerCopy: "CLIENTE",
    vehicleDataTitle: "Datos del vehículo",
    rentalDataTitle: "Datos del alquiler",
    mainDriverTitle: "Conductor principal",
    linkedCompanyTitle: "Empresa",
    technicalTitle: "Datos técnicos de facturación",
    priceBreakdownTitle: "Desglose de facturación",
    additionalDriversTitle: "Conductores adicionales",
    vehicleChangesTitle: "Cambios de vehículo",
    observationsTitle: "Observaciones",
    tenantSignatureLabel: "Firma arrendatario",
    companySignatureLabel: "Firma empresa",
    noData: "N/D",
    noAdditionalDrivers: "Sin conductores adicionales",
    noVehicleChanges: "Sin cambios de vehículo registrados",
    noObservations: "Sin observaciones",
    backConditionsTitle: "Condiciones del contrato",
    backConditionsFallback: "Espacio para términos y condiciones del contrato.",
    frontFooterFormat: "Pie",
    htmlSummaryFormat: "Formato: anverso+reverso, dos copias (empresa y cliente).",
    labels: {
      vehicle: "Vehículo",
      brandModel: "Marca / modelo",
      delivery: "Entrega",
      pickup: "Recogida",
      deliveryPlace: "Lugar entrega",
      deliveryDate: "Fecha entrega",
      deliveryTime: "Hora entrega",
      deliveryFlight: "Vuelo entrega",
      pickupPlace: "Lugar recogida",
      pickupDate: "Fecha recogida",
      pickupTime: "Hora recogida",
      pickupFlight: "Vuelo recogida",
      rentedGroup: "Grupo alquilado",
      billedGroup: "Grupo facturado",
      deliveredGroup: "Grupo",
      plate: "Matrícula",
      color: "Color",
      fuelType: "Combustible",
      branch: "Sucursal",
      customer: "Cliente",
      document: "Documento",
      drivingLicense: "Permiso de conducir",
      drivingLicenseExpiry: "Caducidad permiso",
      documentExpiry: "Caducidad documento",
      nationality: "Nacionalidad",
      permanentAddress: "Dirección permanente",
      localAddress: "Dirección local",
      phone: "Teléfono",
      company: "Empresa",
      taxId: "CIF",
      fiscalAddress: "Domicilio fiscal",
      contact: "Contacto",
      billedDays: "Total días facturados",
      rentedBilledGroup: "Grupo facturado / entregado",
      tariffCode: "Código tarifa",
      maxKmPerDay: "Kilómetros máximos permitidos por día",
      extraKmPrice: "Precio del kilómetro extra",
      deductible: "Franquicia",
    },
    priceLabels: {
      base: "Base",
      descuento: "Descuento",
      discount: "Descuento",
      extras: "Extras",
      combustible: "Combustible",
      fuel: "Combustible",
      seguro: "Seguros",
      insurance: "Seguros",
      cdw: "CDW",
      extension: "Extensión",
      penal: "Penalizaciones",
      penalties: "Penalizaciones",
      total: "Total",
    },
  };
}

function asText(value: string | null | undefined, fallback = "N/D"): string {
  const clean = (value ?? "").trim();
  return clean || fallback;
}

function euro(value: number, language: string): string {
  const locale = language.toLowerCase().startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value || 0);
}

function formatDateTime(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "N/D";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function formatDate(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "N/D";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "N/D";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const raw = (dataUrl ?? "").trim();
  if (!raw.startsWith("data:")) return null;
  const marker = ";base64,";
  const idx = raw.indexOf(marker);
  if (idx <= 0) return null;
  const base64 = raw.slice(idx + marker.length).trim();
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

function parsePriceBreakdown(raw: string | null | undefined, i18n: ContractI18n): PriceBreakdownRow[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  return text
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [left, ...rightParts] = chunk.split(":");
      const key = (left ?? "").trim().toLowerCase();
      const value = rightParts.join(":").trim();
      return {
        label: i18n.priceLabels[key] ?? (left ?? "Concept").trim().replace(/\b\w/g, (letter) => letter.toUpperCase()),
        value: value || i18n.noData,
      };
    });
}

function drawBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  strokeColor: string,
  fillColor = "#ffffff",
) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(fillColor, strokeColor);
  doc.restore();
}

function drawTitle(doc: PDFKit.PDFDocument, x: number, y: number, title: string, accentColor: string) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(accentColor).text(title, x, y);
}

function drawCarSilhouetteBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accentColor: string,
  silhouetteBuffer: Buffer | null,
) {
  drawBox(doc, x, y, width, height, "#cbd5e1");
  drawTitle(doc, x + 10, y + 8, title, accentColor);
  if (silhouetteBuffer) {
    try {
      doc.save();
      doc.roundedRect(x + 6, y + 20, width - 12, height - 24, 4).clip();
      doc.image(silhouetteBuffer, x + 6, y + 20, { fit: [width - 12, height - 24], align: "center", valign: "center" });
      doc.restore();
      return y + height;
    } catch {
      // Si la imagen falla, cae al placeholder.
    }
  }
  const centerX = x + width / 2;
  const centerY = y + height / 2 + 4;
  doc.save();
  doc.lineWidth(1.2).strokeColor("#94a3b8");
  doc.roundedRect(centerX - 76, centerY - 20, 152, 34, 14).stroke();
  doc.moveTo(centerX - 56, centerY - 20).lineTo(centerX - 28, centerY - 38).lineTo(centerX + 30, centerY - 38).lineTo(centerX + 56, centerY - 20).stroke();
  doc.circle(centerX - 48, centerY + 18, 14).stroke();
  doc.circle(centerX + 48, centerY + 18, 14).stroke();
  doc.moveTo(centerX - 12, centerY - 34).lineTo(centerX + 12, centerY - 34).stroke();
  doc.restore();
  return y + height;
}

function resolveTariffMetrics(data: RentalData, reservation: Reservation | null, contract: Contract, language: string) {
  const effectiveRateCode = (contract.appliedRate || reservation?.appliedRate || "").trim();
  if (!effectiveRateCode) {
    return {
      rateCode: "N/D",
      maxKmPerDay: "N/D",
      extraKmPrice: "N/D",
    };
  }
  const rateCode = effectiveRateCode || "N/D";
  const plan = data.tariffPlans.find((item) => item.code.toUpperCase() === rateCode.toUpperCase()) ?? null;
  if (!plan) {
    return { rateCode, maxKmPerDay: "N/D", extraKmPrice: "N/D" };
  }
  const brackets = data.tariffBrackets
    .filter((item) => item.tariffPlanId === plan.id)
    .toSorted((a, b) => a.order - b.order);
  const billedDays = Number.isFinite(reservation.billedDays) ? reservation.billedDays : 0;
  const normalBracket = brackets.find((item) => billedDays >= item.fromDay && billedDays <= item.toDay) ?? null;
  const extraDayBracket = brackets.find((item) => item.isExtraDay) ?? null;
  const activeBracket = normalBracket ?? extraDayBracket;
  if (!activeBracket) {
    return { rateCode, maxKmPerDay: "N/D", extraKmPrice: "N/D" };
  }
  const groupCode = (contract.billedCarGroup || reservation.billedCarGroup || "").trim().toUpperCase();
  const priceRow = data.tariffPrices.find(
    (item) => item.tariffPlanId === plan.id && item.bracketId === activeBracket.id && item.groupCode.toUpperCase() === groupCode,
  ) ?? null;
  const extraDayPriceRow = extraDayBracket
    ? data.tariffPrices.find(
        (item) => item.tariffPlanId === plan.id && item.bracketId === extraDayBracket.id && item.groupCode.toUpperCase() === groupCode,
      ) ?? null
    : null;

  return {
    rateCode,
    maxKmPerDay: priceRow && priceRow.maxKmPerDay > 0 ? `${priceRow.maxKmPerDay} km` : "N/D",
    extraKmPrice: extraDayPriceRow ? euro(extraDayPriceRow.price, language) : "N/D",
  };
}

function drawFixedSpecTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  rows: Array<{ label: string; value: string }>,
  title: string,
  accentColor: string,
  splitRatio = 0.64,
  contentTopPadding = 24,
  contentBottomPadding = 14,
) {
  const safeRows = rows.length > 0 ? rows : [{ label: "", value: "" }];
  drawBox(doc, x, y, width, height, "#cbd5e1");
  drawTitle(doc, x + 10, y + 10, title, accentColor);

  const innerTop = y + contentTopPadding;
  const innerBottom = y + height - contentBottomPadding;
  const rowHeight = Math.max(14, (innerBottom - innerTop) / safeRows.length);
  const splitX = x + Math.floor(width * splitRatio);

  safeRows.forEach((row, index) => {
    const rowY = innerTop + index * rowHeight;
    const nextY = rowY + rowHeight;
    doc.font("Helvetica-Bold").fontSize(7.6);
    const labelTextHeight = doc.heightOfString(row.label, { width: splitX - x - 14, lineGap: 1 });
    doc.font("Helvetica").fontSize(8.7);
    const valueTextHeight = doc.heightOfString(row.value, { width: x + width - splitX - 16, lineGap: 1 });
    const labelY = rowY + Math.max(3, (rowHeight - labelTextHeight) / 2);
    const valueY = rowY + Math.max(2, (rowHeight - valueTextHeight) / 2);
    if (index < safeRows.length - 1) {
      doc.moveTo(x + 8, nextY).lineTo(x + width - 8, nextY).lineWidth(0.5).strokeColor("#d5dbe4").stroke();
    }
    doc.moveTo(splitX, rowY).lineTo(splitX, nextY).lineWidth(0.5).strokeColor("#d5dbe4").stroke();

    doc.font("Helvetica-Bold").fontSize(7.6).fillColor("#64748b").text(row.label, x + 10, labelY, {
      width: splitX - x - 14,
      height: rowHeight - 4,
      ellipsis: true,
    });
    doc.font("Helvetica").fontSize(8.7).fillColor("#0f172a").text(row.value, splitX + 8, valueY, {
      width: x + width - splitX - 16,
      height: rowHeight - 4,
      ellipsis: true,
    });
  });
}

function drawFixedTextSection(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  text: string,
  accentColor: string,
) {
  drawBox(doc, x, y, width, height, "#cbd5e1");
  drawTitle(doc, x + 10, y + 10, title, accentColor);
  doc.font("Helvetica").fontSize(8.5);
  const bodyText = text.trim();
  const textHeight = doc.heightOfString(bodyText, { width: width - 20, lineGap: 1.3 });
  const textY = y + 28 + Math.max(0, (height - 38 - textHeight) / 2);
  doc.fillColor("#0f172a").text(bodyText, x + 10, textY, {
    width: width - 20,
    height: height - 32,
    lineGap: 1.3,
    ellipsis: true,
  });
}

function normalizeAddressLines(parts: Array<string | null | undefined>): string[] {
  const clean = parts.map((item) => (item ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return ["N/D"];
  if (clean.length === 1) return clean;
  if (clean.length === 2) return clean;
  return [clean[0], clean.slice(1, -1).join(", "), clean.at(-1) ?? ""].filter(Boolean);
}

function drawCustomerProfileBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accentColor: string,
  data: CustomerBoxData,
) {
  drawBox(doc, x, y, width, height, "#cbd5e1");
  drawTitle(doc, x + 10, y + 10, title, accentColor);

  const innerX = x + 10;
  const innerW = width - 20;
  const topY = y + 26;
  const leftColW = 98;
  const rightColW = innerW - leftColW - 8;

  const sectionBand = (bandY: number, text: string) => {
    doc.save();
    doc.roundedRect(innerX, bandY, innerW, 14, 3).fill("#eef2f7");
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(7.1).fillColor("#475569").text(text, innerX + 6, bandY + 3, {
      width: innerW - 12,
      align: "center",
    });
  };

  const kv = (rowY: number, label: string, value: string, colX: number, colW: number) => {
    doc.font("Helvetica-Bold").fontSize(6.9).fillColor("#64748b").text(label, colX, rowY, { width: colW, ellipsis: true });
    doc.font("Helvetica").fontSize(8.2).fillColor("#0f172a").text(value, colX, rowY + 8, { width: colW, ellipsis: true });
  };

  kv(topY, "Cliente", data.customerName, innerX, innerW * 0.66);
  kv(topY, "Fecha nacimiento", data.birthDate, innerX + innerW * 0.70, innerW * 0.30);
  kv(topY + 22, "Documento", data.document, innerX, leftColW);
  kv(topY + 22, "Permiso de conducir", data.drivingLicense, innerX + leftColW + 8, rightColW);
  kv(topY + 44, "Caducidad documento", data.documentExpiry, innerX, leftColW);
  kv(topY + 44, "Caducidad permiso", data.drivingLicenseExpiry, innerX + leftColW + 8, rightColW * 0.56);
  kv(topY + 44, "Nacionalidad", data.nationality, innerX + leftColW + 8 + rightColW * 0.60, rightColW * 0.40);

  let cursorY = topY + 66;
  sectionBand(cursorY, "DIRECCIÓN PERMANENTE");
  cursorY += 17;
  doc.font("Helvetica").fontSize(8.1).fillColor("#0f172a");
  for (const line of data.permanentAddressLines.slice(0, 3)) {
    doc.text(line, innerX, cursorY, { width: innerW, ellipsis: true });
    cursorY += 11;
  }

  sectionBand(cursorY, "DIRECCIÓN LOCAL");
  cursorY += 17;
  for (const line of data.localAddressLines.slice(0, 3)) {
    doc.text(line, innerX, cursorY, { width: innerW, ellipsis: true });
    cursorY += 11;
  }

  sectionBand(cursorY, "TELÉFONOS");
  cursorY += 16;
  kv(cursorY, "Teléfono", data.phone1, innerX, innerW * 0.48);
  kv(cursorY, "Móvil", data.phone2, innerX + innerW * 0.52, innerW * 0.48);
}

function drawFixedRentalBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accentColor: string,
  deliveryTitle: string,
  pickupTitle: string,
  deliveryRows: Array<{ label: string; value: string }>,
  pickupRows: Array<{ label: string; value: string }>,
) {
  drawBox(doc, x, y, width, height, "#cbd5e1");
  drawTitle(doc, x + 10, y + 10, title, accentColor);

  const innerTop = y + 18;
  const innerHeight = height - 22;
  const gap = 14;
  const colWidth = (width - 20 - gap) / 2;
  const rowCount = Math.max(deliveryRows.length, pickupRows.length, 1);
  const rowHeight = Math.max(18, innerHeight / rowCount);
  const leftX = x + 10;
  const rightX = leftX + colWidth + gap;

  const drawColumn = (rows: Array<{ label: string; value: string }>, colX: number) => {
    rows.forEach((row, index) => {
      const rowY = innerTop + 6 + index * rowHeight;
      doc.font("Helvetica-Bold").fontSize(7.2).fillColor("#64748b").text(row.label, colX, rowY + 1, {
        width: colWidth,
        height: 8,
        ellipsis: true,
      });
      doc.font("Helvetica").fontSize(8.5).fillColor("#0f172a").text(row.value, colX, rowY + 9, {
        width: colWidth,
        height: rowHeight - 8,
        ellipsis: true,
      });
    });
  };

  drawColumn(deliveryRows, leftX);
  drawColumn(pickupRows, rightX);
}

function drawBottomNotesBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  accentColor: string,
  changesTitle: string,
  changesText: string,
  observationsTitle: string,
  observationsText: string,
) {
  drawBox(doc, x, y, width, height, "#cbd5e1");
  const sectionGap = 10;
  const innerX = x + 10;
  const innerW = width - 20;
  const changesTop = y + 12;
  const dividerY = y + Math.floor(height * 0.54);

  drawTitle(doc, innerX, changesTop, changesTitle, accentColor);
  doc.font("Helvetica").fontSize(8.8);
  const changesHeight = doc.heightOfString(changesText, { width: innerW, lineGap: 1.2 });
  const changesBlockTop = changesTop + 18 + Math.max(0, (dividerY - (changesTop + 24) - changesHeight) / 2);
  doc.fillColor("#0f172a").text(changesText, innerX, changesBlockTop, {
    width: innerW,
    height: dividerY - changesBlockTop - 4,
    lineGap: 1.2,
    ellipsis: true,
  });

  doc.moveTo(innerX, dividerY).lineTo(x + width - 10, dividerY).lineWidth(0.5).strokeColor("#d5dbe4").stroke();

  const obsTop = dividerY + sectionGap;
  drawTitle(doc, innerX, obsTop, observationsTitle, accentColor);
  const observationsHeight = doc.heightOfString(observationsText, { width: innerW, lineGap: 1.2 });
  const obsTextTop = obsTop + 18 + Math.max(0, (y + height - 12 - (obsTop + 24) - observationsHeight) / 2);
  doc.font("Helvetica").fontSize(8.8).fillColor("#0f172a").text(observationsText, innerX, obsTextTop, {
    width: innerW,
    height: y + height - 10 - obsTextTop,
    lineGap: 1.2,
    ellipsis: true,
  });
}

function renderFrontPage(doc: PDFKit.PDFDocument, input: {
  copyType: CopyType;
  accentColor: string;
  i18n: ContractI18n;
  companyName: string;
  companyHeaderRows: string[];
  companyLogoDataUrl: string;
  contract: Contract;
  vehicleRows: Array<{ label: string; value: string }>;
  customerData: CustomerBoxData;
  additionalDrivers: string;
  companyBlockRows: Array<{ label: string; value: string }>;
  rentalRows: Array<{ label: string; value: string }>;
  pickupRentalRows: Array<{ label: string; value: string }>;
  technicalRows: Array<{ label: string; value: string }>;
  priceBreakdownRows: PriceBreakdownRow[];
  vehicleChangesText: string;
  observations: string;
  contractFrontFooter: string;
  silhouetteBuffer: Buffer | null;
}) {
  const accent = input.accentColor;
  const i18n = input.i18n;
  const secondary = "#0f172a";
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 24;
  const contentW = pageW - margin * 2;
  const logoBuffer = dataUrlToBuffer(input.companyLogoDataUrl);
  const legalText =
    "He leído y entiendo los términos y condiciones del presente contrato de alquiler y autorizo con mi firma que todos los importes derivados de este alquiler sean cargados en mi tarjeta de crédito.\n* I have read and agreed the terms of this rental agreement and rental conditions, and I authorize with my signature that all amounts derived from this rent are charged to my creditcard, deposit or others.";

  doc.save();
  doc.rect(0, 0, pageW, 88).fill("#f8fafc");
  doc.restore();

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, 16, { fit: [96, 42] });
    } catch {
      // La cabecera textual sigue funcionando sin logo.
    }
  }
  const companyBlockX = margin + 104;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(secondary).text(input.companyName, companyBlockX, 18, { width: 300 });
  let companyRowY = 34;
  for (const row of input.companyHeaderRows.slice(0, 3)) {
    doc.font("Helvetica").fontSize(8.2).fillColor("#475569").text(row, companyBlockX, companyRowY, { width: 300 });
    companyRowY += 11;
  }
  doc.font("Helvetica-Bold").fontSize(16).fillColor(secondary).text(i18n.contractTitle, margin, 64);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(`Nº ${input.contract.contractNumber}`, pageW - 210, 18, {
    width: 100,
    align: "right",
  });

  doc.save();
  doc.roundedRect(pageW - 116, 40, 92, 22, 6).fill(accent);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(
    `${i18n.copyLabel} ${input.copyType === "EMPRESA" ? i18n.companyCopy : i18n.customerCopy}`,
    pageW - 116,
    46,
    { width: 92, align: "center" },
  );

  const vehicleBandY = 94;
  const vehicleBandH = 48;
  drawBox(doc, margin, vehicleBandY, contentW, vehicleBandH, "#cbd5e1");
  drawTitle(doc, margin + 10, vehicleBandY + 8, i18n.vehicleDataTitle, accent);
  const bandGap = 8;
  const bandColWidth = (contentW - 20 - bandGap * (input.vehicleRows.length - 1)) / input.vehicleRows.length;
  input.vehicleRows.forEach((row, index) => {
    const colX = margin + 10 + index * (bandColWidth + bandGap);
    doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#64748b").text(row.label, colX, vehicleBandY + 21, {
      width: bandColWidth,
      height: 8,
      ellipsis: true,
    });
    doc.font("Helvetica").fontSize(8.1).fillColor("#0f172a").text(row.value, colX, vehicleBandY + 30, {
      width: bandColWidth,
      height: 12,
      ellipsis: true,
    });
  });

  const columnTopY = 148;
  const signatureH = 38;
  const footerY = pageH - 20;
  doc.font("Helvetica").fontSize(5.9);
  const legalHeight = doc.heightOfString(legalText, { width: contentW, lineGap: 1 });
  const signatureY = footerY - 18 - signatureH;
  const legalY = signatureY - 10 - legalHeight;
  const bottomBoxH = 176;
  const bottomBoxY = legalY - 12 - bottomBoxH;
  const topAreaBottom = bottomBoxY - 10;

  const columnGap = 10;
  const columnWidth = (contentW - columnGap) / 2;
  const leftX = margin;
  const rightX = margin + columnWidth + columnGap;
  const additionalDriversText = input.additionalDrivers.trim() || i18n.noAdditionalDrivers;
  const companyRows = input.companyBlockRows.length > 0 ? input.companyBlockRows : [
    { label: i18n.labels.company, value: "" },
    { label: i18n.labels.taxId, value: "" },
    { label: i18n.labels.fiscalAddress, value: "" },
    { label: i18n.labels.contact, value: "" },
  ];

  const leftClientH = 244;
  const leftDriversH = 52;
  const leftCompanyH = Math.max(88, topAreaBottom - columnTopY - leftClientH - leftDriversH - 16);
  const rightRentalH = 128;
  const rightTechnicalH = 90;
  const rightPriceH = topAreaBottom - columnTopY - rightRentalH - rightTechnicalH - 16;

  drawCustomerProfileBox(doc, leftX, columnTopY, columnWidth, leftClientH, i18n.mainDriverTitle, accent, input.customerData);
  drawFixedTextSection(doc, leftX, columnTopY + leftClientH + 8, columnWidth, leftDriversH, i18n.additionalDriversTitle, additionalDriversText, accent);
  drawFixedSpecTable(
    doc,
    leftX,
    columnTopY + leftClientH + leftDriversH + 16,
    columnWidth,
    leftCompanyH,
    companyRows,
    i18n.linkedCompanyTitle,
    accent,
    0.38,
  );

  drawFixedRentalBox(
    doc,
    rightX,
    columnTopY,
    columnWidth,
    rightRentalH,
    i18n.rentalDataTitle,
    accent,
    i18n.labels.delivery,
    i18n.labels.pickup,
    input.rentalRows,
    input.pickupRentalRows,
  );
  drawFixedSpecTable(doc, rightX, columnTopY + rightRentalH + 8, columnWidth, rightTechnicalH, input.technicalRows, i18n.technicalTitle, accent, 0.72, 20, 16);
  drawFixedSpecTable(
    doc,
    rightX,
    columnTopY + rightRentalH + rightTechnicalH + 16,
    columnWidth,
    rightPriceH,
    input.priceBreakdownRows,
    i18n.priceBreakdownTitle,
    accent,
    0.74,
    18,
    10,
  );

  drawBox(doc, leftX, bottomBoxY, columnWidth, bottomBoxH, "#cbd5e1");
  drawTitle(doc, leftX + 10, bottomBoxY + 10, i18n.labels.vehicle, accent);
  if (input.silhouetteBuffer) {
    try {
      const imageX = leftX + 6;
      const imageY = bottomBoxY + 22;
      const imageW = columnWidth - 12;
      const imageH = bottomBoxH - 28;
      doc.save();
      doc.roundedRect(imageX, imageY, imageW, imageH, 6).clip();
      doc.image(input.silhouetteBuffer, imageX, imageY, {
        fit: [imageW, imageH],
        align: "center",
        valign: "center",
      });
      doc.restore();
    } catch {
      drawCarSilhouetteBox(doc, leftX, bottomBoxY, columnWidth, bottomBoxH, i18n.labels.vehicle, accent, null);
    }
  } else {
    drawCarSilhouetteBox(doc, leftX, bottomBoxY, columnWidth, bottomBoxH, i18n.labels.vehicle, accent, null);
  }

  drawBottomNotesBox(
    doc,
    rightX,
    bottomBoxY,
    columnWidth,
    bottomBoxH,
    accent,
    i18n.vehicleChangesTitle,
    input.vehicleChangesText,
    i18n.observationsTitle,
    input.observations || i18n.noObservations,
  );

  doc.font("Helvetica").fontSize(5.9).fillColor("#475569").text(legalText, margin, legalY, {
    width: contentW,
    lineGap: 1,
  });

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(i18n.tenantSignatureLabel, margin + 14, signatureY + 2);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(i18n.companySignatureLabel, margin + contentW / 2 + 8, signatureY + 2);

  doc.font("Helvetica").fontSize(7.6).fillColor("#64748b").text(asText(input.contractFrontFooter, ""), margin, footerY, {
    width: contentW,
    align: "center",
  });
}

function renderBackPage(doc: PDFKit.PDFDocument, input: {
  copyType: CopyType;
  accentColor: string;
  i18n: ContractI18n;
  companyName: string;
  companyHeaderRows: string[];
  companyLogoDataUrl: string;
  contentType: "TEXT" | "HTML";
  content: string;
  layout?: "SINGLE" | "DUAL";
  fontSize?: number;
  contentEs?: string;
  contentEn?: string;
}) {
  const margin = 20;
  const contentW = doc.page.width - margin * 2;
  const normalizedContent = input.contentType === "HTML" ? stripHtml(input.content) : input.content;
  const fallback = input.i18n.backConditionsFallback;
  const body = normalizedContent.trim() || fallback;
  const explicitEs = (input.contentEs || "").trim();
  const explicitEn = (input.contentEn || "").trim();
  const bilingual =
    input.layout === "DUAL"
      ? {
          left: explicitEs || splitBilingualBackContent(body)?.left || fallback,
          right: explicitEn || splitBilingualBackContent(body)?.right || fallback,
        }
      : splitBilingualBackContent(body);
  if (!bilingual) {
    const fontSize = fitBackPageFontSize(doc, [{ text: body, width: contentW }], doc.page.height - margin * 2, input.fontSize || 8.6);
    doc.font("Helvetica").fontSize(fontSize).fillColor("#0f172a").text(body, margin, margin, {
      width: contentW,
      height: doc.page.height - margin * 2,
      align: "justify",
      lineGap: 0.6,
      paragraphGap: 1,
    });
    return;
  }

  const gutter = 12;
  const colW = (contentW - gutter) / 2;
  const usableH = doc.page.height - margin * 2;
  const fontSize = fitBackPageFontSize(
    doc,
    [
      { text: bilingual.left, width: colW },
      { text: bilingual.right, width: colW },
    ],
    usableH,
    input.fontSize || 7.9,
  );

  doc.font("Helvetica").fontSize(fontSize).fillColor("#0f172a");
  doc.text(bilingual.left, margin, margin, {
    width: colW,
    height: usableH,
    align: "justify",
    lineGap: 0.45,
    paragraphGap: 0.8,
  });
  doc.text(bilingual.right, margin + colW + gutter, margin, {
    width: colW,
    height: usableH,
    align: "justify",
    lineGap: 0.45,
    paragraphGap: 0.8,
  });
}

function splitBilingualBackContent(content: string): { left: string; right: string } | null {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;
  const explicitSeparator = normalized.match(/\n\s*(?:\[\[\[EN\]\]\]|\[\[EN\]\]|---EN---|===EN===)\s*\n/i);
  if (explicitSeparator?.index !== undefined) {
    const left = normalized.slice(0, explicitSeparator.index).trim();
    const right = normalized.slice(explicitSeparator.index + explicitSeparator[0].length).trim();
    return left && right ? { left, right } : null;
  }
  const englishTitle = normalized.match(/\n\s*CAR RENTAL CONTRACT\s*\n/i);
  if (englishTitle?.index !== undefined) {
    const left = normalized.slice(0, englishTitle.index).trim();
    const right = normalized.slice(englishTitle.index).trim();
    return left && right ? { left, right } : null;
  }
  return null;
}

function fitBackPageFontSize(
  doc: PDFKit.PDFDocument,
  blocks: Array<{ text: string; width: number }>,
  maxHeight: number,
  preferredSize: number,
) {
  const sizes = [preferredSize, 7.6, 7.3, 7.0, 6.8, 6.6, 6.4, 6.2, 6.0, 5.8, 5.6, 5.4, 5.2, 5.0, 4.8];
  for (const size of sizes) {
    doc.font("Helvetica").fontSize(size);
    const fits = blocks.every((block) => {
      const h = doc.heightOfString(block.text, {
        width: block.width,
        align: "justify",
        lineGap: 0.45,
        paragraphGap: 0.8,
      });
      return h <= maxHeight;
    });
    if (fits) return size;
  }
  return 4.8;
}

function buildContractPdf(input: {
  contract: Contract;
  companyName: string;
  accentColor: string;
  i18n: ContractI18n;
  vehicleRows: Array<{ label: string; value: string }>;
  customerData: CustomerBoxData;
  additionalDrivers: string;
  companyBlockRows: Array<{ label: string; value: string }>;
  rentalRows: Array<{ label: string; value: string }>;
  pickupRentalRows: Array<{ label: string; value: string }>;
  vehicleChangesText: string;
  observations: string;
  priceBreakdownRows: PriceBreakdownRow[];
  contractFrontFooter: string;
  contractBackContent: string;
  contractBackContentType: "TEXT" | "HTML";
  contractBackLayout?: "SINGLE" | "DUAL";
  contractBackFontSize?: number;
  contractBackContentEs?: string;
  contractBackContentEn?: string;
  technicalRows: Array<{ label: string; value: string }>;
  companyHeaderRows: string[];
  companyLogoDataUrl: string;
  silhouetteBuffer: Buffer | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensurePdfkitFontCompat();
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    applyPdfkitFontFallback(doc);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const copies: CopyType[] = ["EMPRESA", "CLIENTE"];
    copies.forEach((copyType, idx) => {
      if (idx > 0) doc.addPage();
      renderFrontPage(doc, {
        copyType,
        accentColor: input.accentColor,
        i18n: input.i18n,
        companyName: input.companyName,
        companyHeaderRows: input.companyHeaderRows,
        companyLogoDataUrl: input.companyLogoDataUrl,
        contract: input.contract,
        vehicleRows: input.vehicleRows,
        customerData: input.customerData,
        additionalDrivers: input.additionalDrivers,
        companyBlockRows: input.companyBlockRows,
        rentalRows: input.rentalRows,
        pickupRentalRows: input.pickupRentalRows,
        vehicleChangesText: input.vehicleChangesText,
        observations: input.observations,
        priceBreakdownRows: input.priceBreakdownRows,
        contractFrontFooter: input.contractFrontFooter,
        silhouetteBuffer: input.silhouetteBuffer,
        technicalRows: input.technicalRows,
      });
      doc.addPage();
      renderBackPage(doc, {
        copyType,
        accentColor: input.accentColor,
        i18n: input.i18n,
        companyName: input.companyName,
        companyHeaderRows: input.companyHeaderRows,
        companyLogoDataUrl: input.companyLogoDataUrl,
        contentType: input.contractBackContentType,
        content: input.contractBackContent,
        layout: input.contractBackLayout,
        fontSize: input.contractBackFontSize,
        contentEs: input.contractBackContentEs,
        contentEn: input.contractBackContentEn,
      });
    });

    doc.end();
  });
}

export async function buildContractDocument(contractId: string): Promise<ContractDocument> {
  const data = await readRentalData();
  const contract = data.contracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error("Contrato no encontrado");
  }

  const reservation = data.reservations.find((item) => item.id === contract.reservationId) ?? null;
  const customer = reservation?.customerId ? data.clients.find((item) => item.id === reservation.customerId) ?? null : null;
  const language = (customer?.language || "es").toLowerCase();
  const i18n = getContractI18n(language);
  const audit = await readAuditEventsByContract({ contractId: contract.id, reservationId: reservation?.id ?? null, limit: 200 });

  const vehicleChanges: VehicleChangeRow[] = audit
    .filter((event) => event.entity === "contract_vehicle_change")
    .map((event) => ({
      when: formatDateTime(event.timestamp),
      fromPlate: asText(String(event.details?.previousPlate ?? ""), "-"),
      toPlate: asText(String(event.details?.nextPlate ?? ""), "-"),
      reason: asText(String(event.details?.reason ?? event.details?.changeReason ?? ""), ""),
    }));

  const companyName = getDocumentCompanyName(data.companySettings);
  const companyHeaderRows = [
    [data.companySettings.taxId].filter(Boolean).join(" ").trim(),
    [data.companySettings.fiscalAddress].filter(Boolean).join(" ").trim(),
    [data.companySettings.companyPhone, data.companySettings.companyEmailFrom].filter((item) => item && item !== "N/D").join(" · "),
  ].filter(Boolean);
  const companyLogoDataUrl = getCompanyLogoDataUrl(data.companySettings);
  const accentColor = getCompanyPrimaryColor(data.companySettings);
  const customerDocument = [customer?.documentType, customer?.documentNumber].filter(Boolean).join(" ").trim();
  const driverLicense = [customer?.licenseType, customer?.licenseNumber].filter(Boolean).join(" ").trim() || i18n.noData;
  const additionalDrivers = asText(contract.additionalDrivers || reservation?.additionalDrivers || customer?.companyDrivers, "");

  const fleetVehicle = contract.vehiclePlate
    ? data.fleetVehicles.find((item) => item.plate.trim().toUpperCase() === contract.vehiclePlate.trim().toUpperCase()) ?? null
    : null;
  const vehicleModel = fleetVehicle ? data.vehicleModels.find((item) => item.id === fleetVehicle.modelId) ?? null : null;
  const vehicleRows = [
    { label: i18n.labels.brandModel, value: asText(vehicleModel ? `${vehicleModel.brand} ${vehicleModel.model}` : reservation?.modelRequested, i18n.noData) },
    { label: i18n.labels.plate, value: asText(contract.vehiclePlate, i18n.noData) },
    { label: i18n.labels.color, value: asText(fleetVehicle?.color, i18n.noData) },
    { label: i18n.labels.deliveredGroup, value: asText(reservation?.assignedVehicleGroup || contract.billedCarGroup, i18n.noData) },
    { label: i18n.labels.fuelType, value: asText(fleetVehicle?.fuelType || vehicleModel?.fuelType, i18n.noData) },
  ];

  const customerData: CustomerBoxData = {
    customerName: asText(contract.customerName, i18n.noData),
    document: asText(customerDocument, i18n.noData),
    documentIssuedAt: asText(formatDate(customer?.documentIssuedAt), i18n.noData),
    documentExpiry: asText(formatDate(customer?.documentExpiresAt), i18n.noData),
    drivingLicense: asText(driverLicense, i18n.noData),
    drivingLicenseIssuedAt: asText(formatDate(customer?.licenseIssuedAt), i18n.noData),
    drivingLicenseExpiry: asText(formatDate(customer?.licenseExpiresAt), i18n.noData),
    nationality: asText(customer?.nationality, i18n.noData),
    birthDate: asText(formatDate(customer?.birthDate), i18n.noData),
    birthPlace: asText(customer?.birthPlace, i18n.noData),
    permanentAddressLines: normalizeAddressLines([
      customer?.residenceStreet || customer?.residenceAddress,
      [customer?.residencePostalCode, customer?.residenceCity].filter(Boolean).join(", "),
      [customer?.residenceRegion, customer?.residenceCountry].filter(Boolean).join(", "),
    ]),
    localAddressLines: normalizeAddressLines([
      customer?.vacationStreet || customer?.vacationAddress || customer?.residenceStreet || customer?.residenceAddress,
      [customer?.vacationPostalCode || customer?.residencePostalCode, customer?.vacationCity || customer?.residenceCity]
        .filter(Boolean)
        .join(", "),
      [customer?.vacationRegion || customer?.residenceRegion, customer?.vacationCountry || customer?.residenceCountry]
        .filter(Boolean)
        .join(", "),
    ]),
    phone1: asText(customer?.phone1, i18n.noData),
    phone2: asText(customer?.phone2, i18n.noData),
  };

  const linkedCompanyClient = reservation?.customerCompany
    ? data.clients.find(
        (item) =>
          item.clientType === "EMPRESA" &&
          item.companyName.trim().toUpperCase() === reservation.customerCompany.trim().toUpperCase(),
      ) ?? null
    : null;
  const companyBlockRows = linkedCompanyClient
    ? [
        { label: i18n.labels.company, value: asText(linkedCompanyClient.companyName, i18n.noData) },
        { label: i18n.labels.taxId, value: asText(linkedCompanyClient.taxId, i18n.noData) },
        { label: i18n.labels.fiscalAddress, value: asText(linkedCompanyClient.fiscalAddress, i18n.noData) },
        { label: i18n.labels.contact, value: asText(linkedCompanyClient.contactPerson || linkedCompanyClient.email || linkedCompanyClient.phone1, i18n.noData) },
      ]
    : [];

  const rentalRows = [
    { label: i18n.labels.deliveryPlace, value: asText(reservation?.deliveryPlace, i18n.noData) },
    { label: i18n.labels.deliveryDate, value: formatDate(contract.deliveryAt) },
    { label: i18n.labels.deliveryTime, value: formatTime(contract.deliveryAt) },
    { label: i18n.labels.deliveryFlight, value: asText(reservation?.deliveryFlightNumber, i18n.noData) },
  ];
  const pickupRentalRows = [
    { label: i18n.labels.pickupPlace, value: asText(reservation?.pickupPlace, i18n.noData) },
    { label: i18n.labels.pickupDate, value: formatDate(contract.pickupAt) },
    { label: i18n.labels.pickupTime, value: formatTime(contract.pickupAt) },
    { label: i18n.labels.pickupFlight, value: asText(reservation?.pickupFlightNumber, i18n.noData) },
  ];

  const observations = asText(reservation?.publicNotes || reservation?.publicObservations, "");

  const tariff = resolveTariffMetrics(data, reservation, contract, language);
  const technicalRows = [
    { label: i18n.labels.billedDays, value: reservation?.billedDays ? String(reservation.billedDays) : i18n.noData },
    { label: i18n.labels.rentedBilledGroup, value: `${asText(contract.billedCarGroup, i18n.noData)} / ${asText(reservation?.assignedVehicleGroup || contract.billedCarGroup, i18n.noData)}` },
    { label: i18n.labels.tariffCode, value: tariff.rateCode },
    { label: i18n.labels.maxKmPerDay, value: tariff.maxKmPerDay },
    { label: i18n.labels.extraKmPrice, value: tariff.extraKmPrice },
  ];
  const priceBreakdownRows = [
    ...parsePriceBreakdown(contract.priceBreakdown, i18n),
    ...parsePriceBreakdown(contract.extrasBreakdown, i18n),
    { label: i18n.labels.deductible, value: asText(contract.deductible, i18n.noData) },
  ];

  const contractFrontFooter = (data.companySettings.contractFrontFooter || data.companySettings.documentFooter || "").trim();
  const contractBackContent = (data.companySettings.contractBackContent || "").trim();
  const contractBackContentType = data.companySettings.contractBackContentType === "HTML" ? "HTML" : "TEXT";
  const contractBackLayout = data.companySettings.contractBackLayout === "DUAL" ? "DUAL" : "SINGLE";
  const contractBackFontSize =
    Number.isFinite(data.companySettings.contractBackFontSize) && data.companySettings.contractBackFontSize > 0
      ? data.companySettings.contractBackFontSize
      : 7.6;
  const contractBackContentEs = (data.companySettings.contractBackContentEs || "").trim();
  const contractBackContentEn = (data.companySettings.contractBackContentEn || "").trim();
  const vehicleChangesText = vehicleChanges.length === 0
    ? i18n.noVehicleChanges
    : vehicleChanges
        .slice(0, 4)
        .map((row) => `${row.when} · ${row.fromPlate} -> ${row.toPlate}${row.reason ? ` · ${row.reason}` : ""}`)
        .join("\n");
  let silhouetteBuffer: Buffer | null = null;
  try {
    silhouetteBuffer = await readFile(path.join(process.cwd(), "public", "brand", "silueta.png"));
  } catch {
    silhouetteBuffer = null;
  }

  const pdfBuffer = await buildContractPdf({
    contract,
    companyName,
    companyHeaderRows,
    companyLogoDataUrl,
    accentColor,
    i18n,
    vehicleRows,
    customerData,
    additionalDrivers,
    companyBlockRows,
    rentalRows,
    pickupRentalRows,
    vehicleChangesText,
    observations,
    priceBreakdownRows,
    contractFrontFooter,
    silhouetteBuffer,
    contractBackContent,
    contractBackContentType,
    contractBackLayout,
    contractBackFontSize,
    contractBackContentEs,
    contractBackContentEn,
    technicalRows,
  });

  return {
    contract,
    language,
    templateUsed: null,
    html: [`<h1>${i18n.contractTitle} ${contract.contractNumber}</h1>`, `<p>${i18n.htmlSummaryFormat}</p>`].join(""),
    pdfBuffer,
  };
}
