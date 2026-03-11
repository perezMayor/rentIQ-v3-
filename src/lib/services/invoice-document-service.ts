import PDFDocument from "pdfkit";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import { applyPdfkitFontFallback, ensurePdfkitFontCompat } from "@/lib/pdfkit-compat";
import type { Client, Invoice, TemplateDocument } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type InvoiceDocument = {
  invoice: Invoice;
  language: string;
  customerEmail: string;
  customerName: string;
  templateUsed: TemplateDocument | null;
  html: string;
  pdfBuffer: Buffer;
};

// Motor simple de sustitución de variables tipo {{clave}} en HTML de plantilla.
function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => data[key] ?? "");
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const raw = (dataUrl ?? "").trim();
  const marker = ";base64,";
  const idx = raw.indexOf(marker);
  if (!raw.startsWith("data:") || idx <= 0) return null;
  try {
    return Buffer.from(raw.slice(idx + marker.length), "base64");
  } catch {
    return null;
  }
}

function fmtMoney(value: number, language: string): string {
  const locale = language.startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value || 0);
}

function fmtDate(value: string, language: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "";
  const locale = language.startsWith("en") ? "en-GB" : "es-ES";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function customerDisplayBlock(customer: Client | null, fallbackName: string): { name: string; taxId: string; address: string; contact: string } {
  const name = customer?.companyName?.trim() || `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim() || fallbackName;
  const taxId = customer?.taxId?.trim() || customer?.documentNumber?.trim() || "N/D";
  const address =
    customer?.fiscalAddress?.trim() ||
    [customer?.residenceStreet, customer?.residenceAddress, customer?.residenceCity, customer?.residenceRegion, customer?.residencePostalCode]
      .filter(Boolean)
      .join(", ")
      .trim() ||
    "N/D";
  const contact = [customer?.email?.trim(), customer?.phone1?.trim()].filter(Boolean).join(" · ") || "N/D";
  return { name, taxId, address, contact };
}

function buildInvoicePdf(input: {
  language: string;
  company: {
    name: string;
    taxId: string;
    fiscalAddress: string;
    phone: string;
    email: string;
    logoDataUrl: string;
    footer: string;
    accentColor: string;
  };
  receiver: { name: string; taxId: string; address: string; contact: string };
  invoice: Invoice;
  contractNumber: string;
}): Promise<Buffer> {
  const t = input.language.startsWith("en")
    ? {
        title: "Invoice",
        issuer: "Issuing company",
        receiver: "Customer / billed company",
        date: "Date",
        contract: "Contract",
        base: "Base",
        extras: "Extras",
        insurance: "Insurance",
        penalties: "Penalties",
        vat: "VAT",
        total: "Total",
      }
    : {
        title: "Factura",
        issuer: "Empresa emisora",
        receiver: "Empresa / cliente receptor",
        date: "Fecha",
        contract: "Contrato",
        base: "Base",
        extras: "Extras",
        insurance: "Seguros",
        penalties: "Penalizaciones",
        vat: "IVA",
        total: "Total",
      };
  return new Promise((resolve, reject) => {
    ensurePdfkitFontCompat();
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    applyPdfkitFontFallback(doc);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = /^#[0-9a-fA-F]{6}$/.test(input.company.accentColor) ? input.company.accentColor : "#2563eb";
    const logoBuffer = dataUrlToBuffer(input.company.logoDataUrl);
    const margin = 28;
    const contentW = doc.page.width - margin * 2;

    doc.rect(0, 0, doc.page.width, 102).fill("#f8fafc");
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, margin, 20, { fit: [102, 48] });
      } catch {
        // logo opcional
      }
    }
    const leftX = logoBuffer ? margin + 112 : margin;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(input.company.name, leftX, 22, { width: 320 });
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569").text(input.company.taxId || "N/D", leftX, 39, { width: 320 });
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569").text(input.company.fiscalAddress || "N/D", leftX, 50, { width: 320 });
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569").text([input.company.phone, input.company.email].filter(Boolean).join(" · ") || "N/D", leftX, 61, { width: 320 });

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(`${t.title} ${input.invoice.invoiceNumber}`, doc.page.width - 240, 24, { width: 210, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`${t.date}: ${fmtDate(input.invoice.issuedAt, input.language)}`, doc.page.width - 240, 48, { width: 210, align: "right" });
    doc.moveTo(margin, 98).lineTo(doc.page.width - margin, 98).strokeColor(accent).lineWidth(1.4).stroke();

    const boxY = 114;
    const gap = 10;
    const boxW = (contentW - gap) / 2;
    const boxH = 116;
    doc.roundedRect(margin, boxY, boxW, boxH, 8).fillAndStroke("#ffffff", "#cbd5e1");
    doc.roundedRect(margin + boxW + gap, boxY, boxW, boxH, 8).fillAndStroke("#ffffff", "#cbd5e1");
    doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text(t.issuer, margin + 10, boxY + 10);
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a")
      .text(input.company.name, margin + 10, boxY + 28, { width: boxW - 20 })
      .text(input.company.taxId || "N/D", margin + 10, boxY + 42, { width: boxW - 20 })
      .text(input.company.fiscalAddress || "N/D", margin + 10, boxY + 56, { width: boxW - 20 })
      .text([input.company.phone, input.company.email].filter(Boolean).join(" · ") || "N/D", margin + 10, boxY + 86, { width: boxW - 20 });

    const rx = margin + boxW + gap;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text(t.receiver, rx + 10, boxY + 10);
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a")
      .text(input.receiver.name || "N/D", rx + 10, boxY + 28, { width: boxW - 20 })
      .text(input.receiver.taxId || "N/D", rx + 10, boxY + 42, { width: boxW - 20 })
      .text(input.receiver.address || "N/D", rx + 10, boxY + 56, { width: boxW - 20 })
      .text(input.receiver.contact || "N/D", rx + 10, boxY + 86, { width: boxW - 20 });

    const tableY = boxY + boxH + 12;
    const labelW = Math.floor(contentW * 0.72);
    const valueX = margin + labelW;
    const rows: Array<[string, string]> = [
      [t.contract, input.contractNumber || "N/D"],
      [t.base, fmtMoney(input.invoice.baseAmount, input.language)],
      [t.extras, fmtMoney(input.invoice.extrasAmount, input.language)],
      [t.insurance, fmtMoney(input.invoice.insuranceAmount, input.language)],
      [t.penalties, fmtMoney(input.invoice.penaltiesAmount, input.language)],
      [t.vat, `${fmtMoney(input.invoice.ivaAmount, input.language)} (${input.invoice.ivaPercent.toFixed(2)}%)`],
      [t.total, fmtMoney(input.invoice.totalAmount, input.language)],
    ];
    doc.roundedRect(margin, tableY, contentW, rows.length * 22 + 20, 8).fillAndStroke("#ffffff", "#cbd5e1");
    let rowY = tableY + 10;
    for (const [label, value] of rows) {
      doc.moveTo(margin + 8, rowY + 18).lineTo(margin + contentW - 8, rowY + 18).strokeColor("#d5dbe4").lineWidth(0.5).stroke();
      doc.moveTo(valueX, rowY).lineTo(valueX, rowY + 18).strokeColor("#d5dbe4").lineWidth(0.5).stroke();
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(label, margin + 10, rowY + 3, { width: labelW - 14 });
      doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(value, valueX + 8, rowY + 3, { width: contentW - labelW - 14 });
      rowY += 22;
    }

    const footer = (input.company.footer || "").trim();
    if (footer) {
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(footer, margin, doc.page.height - 36, { width: contentW });
    }
    doc.end();
  });
}

// Plantilla de contingencia cuando no existe plantilla activa de factura.
function getDefaultInvoiceTemplate(): string {
  return `
    <section>
      <h1>{{company_name}}</h1>
      <h2>{{invoice_number}}</h2>
      <p>{{invoice_name}}</p>
      <p>Cliente: {{customer_name}}</p>
      <p>Fecha: {{issued_at}}</p>
      <p>Base: {{base_amount}}</p>
      <p>Extras: {{extras_amount}}</p>
      <p>Seguros: {{insurance_amount}}</p>
      <p>Penalizaciones: {{penalties_amount}}</p>
      <p>IVA ({{iva_percent}}%): {{iva_amount}}</p>
      <p>Total: {{total_amount}}</p>
      <p>Nota: gastos internos excluidos de factura cliente.</p>
    </section>
  `;
}

export async function buildInvoiceDocument(invoiceId: string): Promise<InvoiceDocument> {
  const data = await readRentalData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new Error("Factura no encontrada");
  }

  // Cadena de resolución para identificar cliente e idioma de emisión.
  const contract = data.contracts.find((item) => item.id === invoice.contractId) ?? null;
  const reservation = contract ? data.reservations.find((item) => item.id === contract.reservationId) ?? null : null;
  const customer = reservation?.customerId
    ? data.clients.find((item) => item.id === reservation.customerId) ?? null
    : null;

  const fallbackLanguage = (invoice.manualLanguage || "es").toLowerCase();
  const resolvedLanguage = customer?.language ? customer.language.toLowerCase() : fallbackLanguage;
  const customerEmail = customer?.email || invoice.manualCustomerEmail || "";
  const customerName = reservation?.customerName || contract?.customerName || invoice.manualCustomerName || "N/D";

  // Selecciona plantilla por idioma de cliente; si no existe, intenta "es".
  const templateUsed =
    data.templates.find((template) => template.templateType === "FACTURA" && template.language === resolvedLanguage && template.active) ??
    data.templates.find((template) => template.templateType === "FACTURA" && template.language === "es" && template.active) ??
    null;

  const templateHtml = templateUsed?.htmlContent || getDefaultInvoiceTemplate();
  const documentCompanyName = getDocumentCompanyName(data.companySettings);
  // Render final del HTML con datos numéricos y fiscales ya normalizados.
  const renderedHtml = renderTemplate(templateHtml, {
    company_name: documentCompanyName,
    company_document_name: documentCompanyName,
    company_tax_id: data.companySettings.taxId,
    company_fiscal_address: data.companySettings.fiscalAddress,
    company_email_from: data.companySettings.companyEmailFrom,
    company_phone: data.companySettings.companyPhone,
    company_website: data.companySettings.companyWebsite,
    company_document_footer: data.companySettings.documentFooter,
    company_logo_data_url: data.companySettings.logoDataUrl,
    company_brand_primary_color: data.companySettings.brandPrimaryColor,
    company_brand_secondary_color: data.companySettings.brandSecondaryColor,
    invoice_number: invoice.invoiceNumber,
    invoice_name: invoice.invoiceName,
    issued_at: invoice.issuedAt,
    contract_number: contract?.contractNumber ?? "N/D",
    customer_name: customerName,
    customer_tax_id: invoice.manualCustomerTaxId || "",
    customer_address: invoice.manualCustomerAddress || "",
    customer_email: customerEmail || "",
    base_amount: invoice.baseAmount.toFixed(2),
    extras_amount: invoice.extrasAmount.toFixed(2),
    insurance_amount: invoice.insuranceAmount.toFixed(2),
    penalties_amount: invoice.penaltiesAmount.toFixed(2),
    iva_percent: invoice.ivaPercent.toFixed(2),
    iva_amount: invoice.ivaAmount.toFixed(2),
    total_amount: invoice.totalAmount.toFixed(2),
  });

  const receiver = customer
    ? customerDisplayBlock(customer, customerName)
    : {
        name: invoice.manualCustomerName || customerName,
        taxId: invoice.manualCustomerTaxId || "N/D",
        address: invoice.manualCustomerAddress || "N/D",
        contact: [invoice.manualCustomerEmail].filter(Boolean).join(" · ") || "N/D",
      };
  const pdf = await buildInvoicePdf({
    language: resolvedLanguage,
    company: {
      name: documentCompanyName,
      taxId: data.companySettings.taxId,
      fiscalAddress: data.companySettings.fiscalAddress,
      phone: data.companySettings.companyPhone,
      email: data.companySettings.companyEmailFrom,
      logoDataUrl: getCompanyLogoDataUrl(data.companySettings),
      footer: data.companySettings.documentFooter,
      accentColor: getCompanyPrimaryColor(data.companySettings),
    },
    receiver,
    invoice,
    contractNumber: contract?.contractNumber ?? "N/D",
  });

  return {
    invoice,
    language: resolvedLanguage,
    customerEmail,
    customerName,
    templateUsed,
    html: renderedHtml,
    pdfBuffer: pdf,
  };
}
