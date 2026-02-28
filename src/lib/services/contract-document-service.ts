import { buildSimplePdf } from "@/lib/pdf";
import type { Contract, TemplateDocument } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type ContractDocument = {
  contract: Contract;
  language: string;
  templateUsed: TemplateDocument | null;
  html: string;
  pdfBuffer: Buffer;
};

function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => data[key] ?? "");
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDefaultContractTemplate(): string {
  return `
    <section>
      <h1>{{company_name}}</h1>
      <h2>Contrato {{contract_number}}</h2>
      <p>Cliente: {{customer_name}}</p>
      <p>Empresa: {{company_customer_name}}</p>
      <p>Entrega: {{delivery_at}}</p>
      <p>Recogida: {{pickup_at}}</p>
      <p>Grupo facturado: {{billed_car_group}}</p>
      <p>Matrícula: {{vehicle_plate}}</p>
      <p>Base: {{base_amount}}</p>
      <p>Descuento: {{discount_amount}}</p>
      <p>Extras: {{extras_amount}}</p>
      <p>Combustible: {{fuel_amount}}</p>
      <p>Seguros: {{insurance_amount}}</p>
      <p>Penalizaciones: {{penalties_amount}}</p>
      <p>Total contrato: {{total_settlement}}</p>
      <p>Caja: {{cash_amount}} ({{cash_method}})</p>
      <p>Fianza: {{deposit_amount}}</p>
      <p>Franquicia: {{deductible}}</p>
      <p>Notas: {{private_notes}}</p>
    </section>
  `;
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

  const templateUsed =
    data.templates.find((template) => template.templateType === "CONTRATO" && template.language === language && template.active) ??
    data.templates.find((template) => template.templateType === "CONTRATO" && template.language === "es" && template.active) ??
    null;
  const templateHtml = templateUsed?.htmlContent || getDefaultContractTemplate();

  const renderedHtml = renderTemplate(templateHtml, {
    company_name: data.companySettings.companyName,
    company_tax_id: data.companySettings.taxId,
    company_fiscal_address: data.companySettings.fiscalAddress,
    contract_number: contract.contractNumber,
    customer_name: contract.customerName || "N/D",
    company_customer_name: contract.companyName || "N/D",
    delivery_at: contract.deliveryAt || "N/D",
    pickup_at: contract.pickupAt || "N/D",
    billed_car_group: contract.billedCarGroup || "N/D",
    vehicle_plate: contract.vehiclePlate || "N/D",
    base_amount: contract.baseAmount.toFixed(2),
    discount_amount: contract.discountAmount.toFixed(2),
    extras_amount: contract.extrasAmount.toFixed(2),
    fuel_amount: contract.fuelAmount.toFixed(2),
    insurance_amount: contract.insuranceAmount.toFixed(2),
    penalties_amount: contract.penaltiesAmount.toFixed(2),
    total_settlement: contract.totalSettlement.toFixed(2),
    cash_amount: (contract.cashRecord?.amount ?? 0).toFixed(2),
    cash_method: contract.cashRecord?.method ?? "N/D",
    deposit_amount: (reservation?.depositAmount ?? 0).toFixed(2),
    deductible: contract.deductible || "N/D",
    private_notes: contract.privateNotes || "",
  });

  const pdf = await buildSimplePdf({
    title: `Contrato ${contract.contractNumber}`,
    subtitle: `Plantilla: ${templateUsed?.templateCode ?? "DEFAULT"} | Idioma: ${language}`,
    sections: [
      {
        title: "Contenido renderizado",
        rows: [["HTML", stripHtml(renderedHtml)]],
      },
      {
        title: "Datos contrato",
        rows: [
          ["Cliente", contract.customerName || "N/D"],
          ["Entrega", contract.deliveryAt || "N/D"],
          ["Recogida", contract.pickupAt || "N/D"],
          ["Grupo", contract.billedCarGroup || "N/D"],
          ["Matrícula", contract.vehiclePlate || "N/D"],
          ["Total", contract.totalSettlement.toFixed(2)],
          ["Caja", `${(contract.cashRecord?.amount ?? 0).toFixed(2)} (${contract.cashRecord?.method ?? "N/D"})`],
        ],
      },
    ],
  });

  return {
    contract,
    language,
    templateUsed,
    html: renderedHtml,
    pdfBuffer: pdf,
  };
}
