import { buildSimplePdf } from "@/lib/pdf";
import { getCompanyLogoDataUrl, getCompanyPrimaryColor, getDocumentCompanyName } from "@/lib/company-brand";
import type { Invoice, TemplateDocument } from "@/lib/domain/rental";
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

// Limpia HTML para poder incrustarlo como texto plano dentro del PDF resumen.
function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const language = (customer?.language || "es").toLowerCase();
  const customerEmail = customer?.email || "";
  const customerName = reservation?.customerName || contract?.customerName || "N/D";

  // Selecciona plantilla por idioma de cliente; si no existe, intenta "es".
  const templateUsed =
    data.templates.find((template) => template.templateType === "FACTURA" && template.language === language && template.active) ??
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
    base_amount: invoice.baseAmount.toFixed(2),
    extras_amount: invoice.extrasAmount.toFixed(2),
    insurance_amount: invoice.insuranceAmount.toFixed(2),
    penalties_amount: invoice.penaltiesAmount.toFixed(2),
    iva_percent: invoice.ivaPercent.toFixed(2),
    iva_amount: invoice.ivaAmount.toFixed(2),
    total_amount: invoice.totalAmount.toFixed(2),
  });

  // El PDF guarda un resumen legible de lo renderizado y de importes clave.
  const pdf = await buildSimplePdf({
    title: `${invoice.invoiceNumber} - ${invoice.invoiceName}`,
    subtitle: `Plantilla: ${templateUsed?.templateCode ?? "DEFAULT"} | Idioma: ${language}`,
    companyName: documentCompanyName,
    companyTaxId: data.companySettings.taxId,
    companyAddress: data.companySettings.fiscalAddress,
    companyFooter: data.companySettings.documentFooter,
    logoDataUrl: getCompanyLogoDataUrl(data.companySettings),
    accentColor: getCompanyPrimaryColor(data.companySettings),
    sections: [
      {
        title: "Contenido renderizado",
        rows: [["HTML", stripHtml(renderedHtml)]],
      },
      {
        title: "Datos factura",
        rows: [
          ["Cliente", customerName],
          ["Base", invoice.baseAmount.toFixed(2)],
          ["Extras", invoice.extrasAmount.toFixed(2)],
          ["Seguros", invoice.insuranceAmount.toFixed(2)],
          ["Penalizaciones", invoice.penaltiesAmount.toFixed(2)],
          ["IVA", `${invoice.ivaAmount.toFixed(2)} (${invoice.ivaPercent.toFixed(2)}%)`],
          ["Total", invoice.totalAmount.toFixed(2)],
        ],
      },
    ],
  });

  return {
    invoice,
    language,
    customerEmail,
    customerName,
    templateUsed,
    html: renderedHtml,
    pdfBuffer: pdf,
  };
}
