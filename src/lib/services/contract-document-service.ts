import PDFDocument from "pdfkit";
import { readAuditEventsByContract } from "@/lib/audit";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { ensurePdfkitFontCompat } from "@/lib/pdfkit-compat";
import type { Client, Contract, RentalData, Reservation, TemplateDocument } from "@/lib/domain/rental";
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

type ContractI18n = {
  contractTitle: string;
  copyLabel: string;
  companyCopy: string;
  customerCopy: string;
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
    delivery: string;
    pickup: string;
    rentedGroup: string;
    billedGroup: string;
    plate: string;
    branch: string;
    customer: string;
    document: string;
    drivingLicense: string;
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
      rentalDataTitle: "Rental details",
      mainDriverTitle: "Main driver",
      linkedCompanyTitle: "Linked company",
      technicalTitle: "Technical billing data",
      priceBreakdownTitle: "Price breakdown",
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
        delivery: "Delivery",
        pickup: "Return",
        rentedGroup: "Rented group",
        billedGroup: "Billed group",
        plate: "Plate",
        branch: "Branch",
        customer: "Customer",
        document: "Document",
        drivingLicense: "Driving license",
        permanentAddress: "Permanent address",
        localAddress: "Local address",
        phone: "Phone",
        company: "Company",
        taxId: "Tax ID",
        fiscalAddress: "Fiscal address",
        contact: "Contact",
        billedDays: "Total billed days",
        rentedBilledGroup: "Rented / billed group",
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
    rentalDataTitle: "Datos del alquiler",
    mainDriverTitle: "Conductor principal",
    linkedCompanyTitle: "Empresa vinculada",
    technicalTitle: "Datos técnicos de facturación",
    priceBreakdownTitle: "Desglose de precios",
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
      delivery: "Entrega",
      pickup: "Recogida",
      rentedGroup: "Grupo alquilado",
      billedGroup: "Grupo facturado",
      plate: "Matrícula",
      branch: "Sucursal",
      customer: "Cliente",
      document: "Documento",
      drivingLicense: "Carné conducir",
      permanentAddress: "Dirección permanente",
      localAddress: "Dirección local",
      phone: "Teléfono",
      company: "Empresa",
      taxId: "CIF",
      fiscalAddress: "Domicilio fiscal",
      contact: "Contacto",
      billedDays: "Total días facturados",
      rentedBilledGroup: "Grupo alquilado / facturado",
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
        label: i18n.priceLabels[key] ?? (left ?? "Concept").trim(),
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

function drawKeyValueRows(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<{ label: string; value: string }>,
) {
  let cursor = y;
  for (const row of rows) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text(row.label, x, cursor, { width });
    cursor += 10;
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(row.value, x, cursor, { width, lineGap: 1 });
    const valueHeight = doc.heightOfString(row.value, { width, lineGap: 1, align: "left" });
    cursor += Math.max(16, valueHeight + 6);
  }
  return cursor;
}

function estimateKeyValueRowsHeight(
  doc: PDFKit.PDFDocument,
  width: number,
  rows: Array<{ label: string; value: string }>,
) {
  let total = 0;
  for (const row of rows) {
    doc.font("Helvetica").fontSize(10);
    const valueHeight = doc.heightOfString(row.value, { width, lineGap: 1, align: "left" });
    total += 10 + Math.max(16, valueHeight + 6);
  }
  return total;
}

function normalizeLocalAddress(customer: Client | null): string {
  if (!customer) return "N/D";
  const local = [customer.vacationStreet, customer.vacationAddress, customer.vacationCity, customer.vacationRegion, customer.vacationPostalCode]
    .filter(Boolean)
    .join(", ")
    .trim();
  if (local) return local;
  return [
    customer.residenceStreet,
    customer.residenceAddress,
    customer.residenceCity,
    customer.residenceRegion,
    customer.residencePostalCode,
  ]
    .filter(Boolean)
    .join(", ")
    .trim() || "N/D";
}

function resolveTariffMetrics(data: RentalData, reservation: Reservation | null, contract: Contract, language: string) {
  if (!reservation || !reservation.appliedRate) {
    return {
      rateCode: "N/D",
      maxKmPerDay: "N/D",
      extraKmPrice: "N/D",
    };
  }
  const rateCode = reservation.appliedRate.trim() || "N/D";
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

function drawSpecTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<{ label: string; value: string }>,
) {
  const headerOffset = 28;
  const rowHeight = 18;
  const splitX = x + Math.floor(width * 0.73);
  const totalHeight = rowHeight * rows.length;

  drawBox(doc, x, y, width, totalHeight + headerOffset + 8, "#cbd5e1");
  drawTitle(doc, x + 10, y + 8, "Datos técnicos de facturación", "#2563eb");

  let rowY = y + headerOffset;
  for (const row of rows) {
    doc.moveTo(x + 8, rowY + rowHeight).lineTo(x + width - 8, rowY + rowHeight).lineWidth(0.5).strokeColor("#d5dbe4").stroke();
    doc.moveTo(splitX, rowY).lineTo(splitX, rowY + rowHeight).lineWidth(0.5).strokeColor("#d5dbe4").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text(row.label, x + 10, rowY + 4, { width: splitX - x - 14 });
    doc.font("Helvetica").fontSize(9.5).fillColor("#0f172a").text(row.value, splitX + 8, rowY + 3, { width: x + width - splitX - 16 });
    rowY += rowHeight;
  }
  return y + totalHeight + headerOffset + 8;
}

function drawPriceBreakdownTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: PriceBreakdownRow[],
) {
  const headerOffset = 28;
  const safeRows = rows.length > 0 ? rows.slice(0, 8) : [{ label: "Sin desglose de precios", value: "N/D" }];
  const rowHeight = 16;
  const splitX = x + Math.floor(width * 0.73);
  const totalHeight = rowHeight * safeRows.length;

  drawBox(doc, x, y, width, totalHeight + headerOffset + 8, "#cbd5e1");
  drawTitle(doc, x + 10, y + 8, "Desglose de precios", "#2563eb");
  let rowY = y + headerOffset;
  for (const row of safeRows) {
    doc.moveTo(x + 8, rowY + rowHeight).lineTo(x + width - 8, rowY + rowHeight).lineWidth(0.5).strokeColor("#d5dbe4").stroke();
    doc.moveTo(splitX, rowY).lineTo(splitX, rowY + rowHeight).lineWidth(0.5).strokeColor("#d5dbe4").stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text(row.label, x + 10, rowY + 3, { width: splitX - x - 14 });
    doc.font("Helvetica").fontSize(9.5).fillColor("#0f172a").text(row.value, splitX + 8, rowY + 2, { width: x + width - splitX - 16 });
    rowY += rowHeight;
  }
  return y + totalHeight + headerOffset + 8;
}

function renderFrontPage(doc: PDFKit.PDFDocument, input: {
  copyType: CopyType;
  accentColor: string;
  i18n: ContractI18n;
  companyName: string;
  companyHeaderRows: string[];
  companyLogoDataUrl: string;
  contract: Contract;
  reservation: Reservation | null;
  customer: Client | null;
  customerDocument: string;
  customerAddress: string;
  customerLocalAddress: string;
  customerPhone: string;
  driverLicense: string;
  additionalDrivers: string;
  companyBlockRows: Array<{ label: string; value: string }>;
  vehicleChanges: VehicleChangeRow[];
  observations: string;
  priceBreakdownRows: PriceBreakdownRow[];
  contractFrontFooter: string;
  technicalRows: Array<{ label: string; value: string }>;
}) {
  const accent = input.accentColor;
  const i18n = input.i18n;
  const secondary = "#0f172a";
  const pageW = doc.page.width;
  const margin = 24;
  const contentW = pageW - margin * 2;
  const logoBuffer = dataUrlToBuffer(input.companyLogoDataUrl);

  doc.save();
  doc.rect(0, 0, pageW, 96).fill("#f8fafc");
  doc.restore();

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, 18, { fit: [96, 44] });
    } catch {
      // Ignora error de imagen y continúa con cabecera textual.
    }
  }
  const companyBlockX = margin + 104;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(secondary).text(input.companyName, companyBlockX, 20, { width: 290 });
  let companyRowY = 36;
  for (const row of input.companyHeaderRows.slice(0, 3)) {
    doc.font("Helvetica").fontSize(8.2).fillColor("#475569").text(row, companyBlockX, companyRowY, { width: 290 });
    companyRowY += 11;
  }
  doc.font("Helvetica-Bold").fontSize(17).fillColor(secondary).text(i18n.contractTitle, margin, 66);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a")
    .text(`Nº ${input.contract.contractNumber}`, pageW - 220, 20, { width: 110, align: "right" });

  doc.save();
  doc.roundedRect(pageW - 116, 42, 92, 22, 6).fill(accent);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
    .text(`${i18n.copyLabel} ${input.copyType === "EMPRESA" ? i18n.companyCopy : i18n.customerCopy}`, pageW - 116, 48, { width: 92, align: "center" });

  const leftW = (contentW - 10) / 2;
  const rightX = margin + leftW + 10;
  const topY = 104;
  const leftRows = [
    { label: i18n.labels.delivery, value: formatDateTime(input.contract.deliveryAt) },
    { label: i18n.labels.pickup, value: formatDateTime(input.contract.pickupAt) },
    { label: i18n.labels.rentedGroup, value: asText(input.reservation?.billedCarGroup, i18n.noData) },
    { label: i18n.labels.billedGroup, value: asText(input.contract.billedCarGroup, i18n.noData) },
    { label: i18n.labels.plate, value: asText(input.contract.vehiclePlate, i18n.noData) },
    { label: i18n.labels.branch, value: asText(input.contract.branchCode, i18n.noData) },
  ];
  const rightRows = [
    { label: i18n.labels.customer, value: asText(input.contract.customerName, i18n.noData) },
    { label: i18n.labels.document, value: asText(input.customerDocument, i18n.noData) },
    { label: i18n.labels.drivingLicense, value: asText(input.driverLicense, i18n.noData) },
    { label: i18n.labels.permanentAddress, value: asText(input.customerAddress, i18n.noData) },
    { label: i18n.labels.localAddress, value: asText(input.customerLocalAddress, i18n.noData) },
    { label: i18n.labels.phone, value: asText(input.customerPhone, i18n.noData) },
  ];
  const topH = Math.max(
    150,
    26 + estimateKeyValueRowsHeight(doc, leftW - 20, leftRows),
    26 + estimateKeyValueRowsHeight(doc, leftW - 20, rightRows),
  );

  drawBox(doc, margin, topY, leftW, topH, "#cbd5e1");
  drawBox(doc, rightX, topY, leftW, topH, "#cbd5e1");

  drawTitle(doc, margin + 10, topY + 10, i18n.rentalDataTitle, accent);
  drawKeyValueRows(doc, margin + 10, topY + 26, leftW - 20, leftRows);

  drawTitle(doc, rightX + 10, topY + 10, i18n.mainDriverTitle, accent);
  drawKeyValueRows(doc, rightX + 10, topY + 26, leftW - 20, rightRows);

  let cursorY = topY + topH + 6;

  if (input.companyBlockRows.length > 0) {
    const companyH = 66;
    drawBox(doc, margin, cursorY, contentW, companyH, "#cbd5e1");
    drawTitle(doc, margin + 10, cursorY + 10, i18n.linkedCompanyTitle, accent);
    drawKeyValueRows(doc, margin + 10, cursorY + 26, contentW - 20, input.companyBlockRows);
    cursorY += companyH + 6;
  }

  cursorY = drawSpecTable(doc, margin, cursorY, contentW, input.technicalRows) + 6;

  cursorY = drawPriceBreakdownTable(doc, margin, cursorY, contentW, input.priceBreakdownRows) + 6;

  const halfW = (contentW - 10) / 2;
  drawBox(doc, margin, cursorY, halfW, 72, "#cbd5e1");
  drawTitle(doc, margin + 10, cursorY + 10, i18n.additionalDriversTitle, accent);
  doc.font("Helvetica").fontSize(8.5).fillColor("#0f172a").text(input.additionalDrivers || i18n.noAdditionalDrivers, margin + 10, cursorY + 26, {
    width: halfW - 20,
    lineGap: 1,
  });

  drawBox(doc, margin + halfW + 10, cursorY, halfW, 72, "#cbd5e1");
  drawTitle(doc, margin + halfW + 20, cursorY + 10, i18n.vehicleChangesTitle, accent);
  const changesText = input.vehicleChanges.length === 0
    ? i18n.noVehicleChanges
    : input.vehicleChanges
        .slice(0, 3)
        .map((row) => `${row.when} · ${row.fromPlate} -> ${row.toPlate}${row.reason ? ` (${row.reason})` : ""}`)
        .join("\n");
  doc.font("Helvetica").fontSize(8).fillColor("#0f172a").text(changesText, margin + halfW + 20, cursorY + 26, {
    width: halfW - 20,
    lineGap: 1,
  });
  cursorY += 78;

  drawBox(doc, margin, cursorY, contentW, 52, "#cbd5e1");
  drawTitle(doc, margin + 10, cursorY + 10, i18n.observationsTitle, accent);
  doc.font("Helvetica").fontSize(8.5).fillColor("#0f172a").text(input.observations || i18n.noObservations, margin + 10, cursorY + 24, {
    width: contentW - 20,
    lineGap: 1,
  });
  cursorY += 58;

  drawBox(doc, margin, cursorY, contentW, 64, "#cbd5e1");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(i18n.tenantSignatureLabel, margin + 14, cursorY + 10);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text(i18n.companySignatureLabel, margin + contentW / 2 + 6, cursorY + 10);
  doc.moveTo(margin + 14, cursorY + 46).lineTo(margin + contentW / 2 - 14, cursorY + 46).strokeColor("#94a3b8").stroke();
  doc.moveTo(margin + contentW / 2 + 6, cursorY + 46).lineTo(margin + contentW - 14, cursorY + 46).strokeColor("#94a3b8").stroke();

  doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(
    asText(input.contractFrontFooter, ""),
    margin,
    doc.page.height - 46,
    { width: contentW, align: "left" },
  );
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
}) {
  const margin = 30;
  const contentW = doc.page.width - margin * 2;
  const logoBuffer = dataUrlToBuffer(input.companyLogoDataUrl);
  const normalizedContent = input.contentType === "HTML" ? stripHtml(input.content) : input.content;
  const fallback = input.i18n.backConditionsFallback;
  const body = normalizedContent.trim() || fallback;

  doc.save();
  doc.rect(0, 0, doc.page.width, 96).fill("#f8fafc");
  doc.restore();

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, 18, { fit: [96, 44] });
    } catch {
      // Ignora error de imagen y continúa con cabecera textual.
    }
  }
  const companyBlockX = margin + 104;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(input.companyName, companyBlockX, 20, { width: 290 });
  let companyRowY = 36;
  for (const row of input.companyHeaderRows.slice(0, 3)) {
    doc.font("Helvetica").fontSize(8.2).fillColor("#475569").text(row, companyBlockX, companyRowY, { width: 290 });
    companyRowY += 11;
  }
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(input.i18n.backConditionsTitle, margin, 66);

  doc.save();
  doc.roundedRect(doc.page.width - 120, 42, 92, 22, 6).fill(input.accentColor);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
    .text(
      `${input.i18n.copyLabel} ${input.copyType === "EMPRESA" ? input.i18n.companyCopy : input.i18n.customerCopy}`,
      doc.page.width - 120,
      48,
      { width: 92, align: "center" },
    );

  drawBox(doc, margin, 112, contentW, doc.page.height - 172, "#cbd5e1", "#ffffff");
  doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(body, margin + 14, 128, {
    width: contentW - 28,
    align: "justify",
    lineGap: 2,
  });
}

function buildContractPdf(input: {
  contract: Contract;
  companyName: string;
  accentColor: string;
  i18n: ContractI18n;
  reservation: Reservation | null;
  customer: Client | null;
  customerDocument: string;
  customerAddress: string;
  customerLocalAddress: string;
  customerPhone: string;
  driverLicense: string;
  additionalDrivers: string;
  companyBlockRows: Array<{ label: string; value: string }>;
  vehicleChanges: VehicleChangeRow[];
  observations: string;
  priceBreakdownRows: PriceBreakdownRow[];
  contractFrontFooter: string;
  contractBackContent: string;
  contractBackContentType: "TEXT" | "HTML";
  technicalRows: Array<{ label: string; value: string }>;
  companyHeaderRows: string[];
  companyLogoDataUrl: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensurePdfkitFontCompat();
    const doc = new PDFDocument({ size: "A4", margin: 0 });
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
        reservation: input.reservation,
        customer: input.customer,
        customerDocument: input.customerDocument,
        customerAddress: input.customerAddress,
        customerLocalAddress: input.customerLocalAddress,
        customerPhone: input.customerPhone,
        driverLicense: input.driverLicense,
        additionalDrivers: input.additionalDrivers,
        companyBlockRows: input.companyBlockRows,
        vehicleChanges: input.vehicleChanges,
        observations: input.observations,
        priceBreakdownRows: input.priceBreakdownRows,
        contractFrontFooter: input.contractFrontFooter,
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
  const customerAddress = customer
    ? [customer.residenceStreet, customer.residenceAddress, customer.residenceCity, customer.residenceRegion, customer.residencePostalCode]
        .filter(Boolean)
        .join(", ")
    : "N/D";
  const customerLocalAddress = normalizeLocalAddress(customer);
  const customerPhone = customer?.phone1 || i18n.noData;
  const driverLicense = [customer?.licenseType, customer?.licenseNumber].filter(Boolean).join(" ").trim() || i18n.noData;
  const additionalDrivers = asText(contract.additionalDrivers || reservation?.additionalDrivers || customer?.companyDrivers, "");

  const hasIntermediaryCompany = Boolean((contract.companyName ?? "").trim());
  const companyBlockRows = hasIntermediaryCompany
    ? [
        { label: i18n.labels.company, value: asText(contract.companyName, i18n.noData) },
        { label: i18n.labels.taxId, value: asText(customer?.taxId, i18n.noData) },
        { label: i18n.labels.fiscalAddress, value: asText(customer?.fiscalAddress, i18n.noData) },
        { label: i18n.labels.contact, value: asText(customer?.contactPerson, i18n.noData) },
      ]
    : [];

  const observations = [
    asText(reservation?.publicObservations, ""),
    asText(reservation?.privateObservations, ""),
    asText(contract.privateNotes, ""),
    asText(contract.checkOutNotes, ""),
    asText(contract.checkInNotes, ""),
  ]
    .filter(Boolean)
    .join(" | ");

  const tariff = resolveTariffMetrics(data, reservation, contract, language);
  const technicalRows = [
    { label: i18n.labels.billedDays, value: reservation?.billedDays ? String(reservation.billedDays) : i18n.noData },
    { label: i18n.labels.rentedBilledGroup, value: `${asText(reservation?.billedCarGroup, i18n.noData)} / ${asText(contract.billedCarGroup, i18n.noData)}` },
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

  const pdfBuffer = await buildContractPdf({
    contract,
    companyName,
    companyHeaderRows,
    companyLogoDataUrl,
    accentColor,
    i18n,
    reservation,
    customer,
    customerDocument,
    customerAddress,
    customerLocalAddress,
    customerPhone,
    driverLicense,
    additionalDrivers,
    companyBlockRows,
    vehicleChanges,
    observations,
    priceBreakdownRows,
    contractFrontFooter,
    contractBackContent,
    contractBackContentType,
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
