import { appendAuditEvent } from "@/lib/audit";
import { getDocumentCompanyName } from "@/lib/company-brand";
import { sendMailFromCompany } from "@/lib/mail";
import type { RoleName } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";
import { buildBudgetTemplateData, getBudgetBaseTemplate, renderTemplateWithMacros } from "@/lib/services/template-renderer";

type BudgetMailInput = {
  toEmail: string;
  language: string;
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

export async function sendBudgetUsingTemplate(
  input: BudgetMailInput,
  actor: { id: string; role: RoleName },
): Promise<void> {
  const toEmail = input.toEmail.trim();
  if (!toEmail || !toEmail.includes("@")) {
    throw new Error("Email destino no valido");
  }

  const data = await readRentalData();
  const language = (input.language || "es").trim().toLowerCase();
  const templateUsed =
    data.templates.find((template) => template.templateType === "PRESUPUESTO" && template.language === language && template.active) ??
    data.templates.find((template) => template.templateType === "PRESUPUESTO" && template.language === "es" && template.active) ??
    data.templates.find((template) => template.templateType === "PRESUPUESTO" && template.active) ??
    null;
  const templateHtml = templateUsed?.htmlContent || getBudgetBaseTemplate(language);
  const documentCompanyName = getDocumentCompanyName(data.companySettings);
  const renderedHtml = renderTemplateWithMacros(
    templateHtml,
    buildBudgetTemplateData({
      language,
      company: {
        name: documentCompanyName,
        taxId: data.companySettings.taxId,
        fiscalAddress: data.companySettings.fiscalAddress,
        emailFrom: data.companySettings.companyEmailFrom,
        phone: data.companySettings.companyPhone,
        website: data.companySettings.companyWebsite,
        footer: data.companySettings.documentFooter,
        logoDataUrl: data.companySettings.logoDataUrl,
        brandPrimaryColor: data.companySettings.brandPrimaryColor,
        brandSecondaryColor: data.companySettings.brandSecondaryColor,
      },
      budget: {
        deliveryAt: input.deliveryAt,
        deliveryPlace: input.deliveryPlace,
        pickupAt: input.pickupAt,
        pickupPlace: input.pickupPlace,
        billedCarGroup: input.billedCarGroup,
        billedDays: input.billedDays,
        appliedRate: input.appliedRate,
        baseAmount: input.baseAmount,
        discountAmount: input.discountAmount,
        insuranceAmount: input.insuranceAmount,
        extrasAmount: input.extrasAmount,
        fuelAmount: input.fuelAmount,
        totalAmount: input.totalAmount,
        extrasBreakdown: input.extrasBreakdown,
      },
    }),
  );

  const mailFrom = data.companySettings.companyEmailFrom !== "N/D" ? data.companySettings.companyEmailFrom : undefined;

  try {
    await sendMailFromCompany({
      fromOverride: mailFrom,
      to: toEmail,
      subject: "Presupuesto",
      html: renderedHtml,
    });
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "budget_send_email",
      entityId: toEmail,
      details: {
        toEmail,
        language,
        appliedRate: input.appliedRate,
        billedCarGroup: input.billedCarGroup,
        totalAmount: input.totalAmount,
        status: "ENVIADA",
      },
    });
  } catch (error) {
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "budget_send_email",
      entityId: toEmail,
      details: {
        toEmail,
        language,
        appliedRate: input.appliedRate,
        billedCarGroup: input.billedCarGroup,
        totalAmount: input.totalAmount,
        status: "ERROR",
        message: error instanceof Error ? error.message : "Error enviando presupuesto",
      },
    });
    throw error;
  }
}
