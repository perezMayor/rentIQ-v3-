import type { TemplateDocument } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type ContractPreprintDocument = {
  templateUsed: TemplateDocument | null;
  html: string;
};

export async function buildContractPreprintDocument(language = "es"): Promise<ContractPreprintDocument> {
  const data = await readRentalData();
  const lang = language.toLowerCase();
  const templateUsed =
    data.templates.find((template) => template.templateType === "CONTRATO" && template.language === lang && template.active) ??
    data.templates.find((template) => template.templateType === "CONTRATO" && template.language === "es" && template.active) ??
    null;

  const html =
    templateUsed?.htmlContent ||
    `
      <section style="font-family:Segoe UI, Arial, sans-serif; color:#111827;">
        <h1>Contrato en blanco</h1>
        <h3>Datos cliente</h3>
        <p>Nombre / Razón social: ________________________</p>
        <p>Documento: ________________________</p>
        <p>Carnet conducir: ________________________</p>
        <h3>Datos alquiler</h3>
        <p>Sucursal entrega: ________________________</p>
        <p>Fecha/hora entrega: ________________________</p>
        <p>Sucursal recogida: ________________________</p>
        <p>Fecha/hora recogida: ________________________</p>
        <p>Grupo: ________________________</p>
        <p>Matrícula: ________________________</p>
        <h3>Importes</h3>
        <p>Tarifa base: ________________________</p>
        <p>Extras: ________________________</p>
        <p>Seguros: ________________________</p>
        <p>Penalizaciones: ________________________</p>
        <p>Fianza: ________________________</p>
        <p>Total: ________________________</p>
        <h3>Firmas</h3>
        <p>Firma cliente: ________________________</p>
        <p>Firma empresa: ________________________</p>
      </section>
    `;

  return { templateUsed, html };
}
