// Servicio de negocio para reservation confirmation document service.
import type { Reservation, TemplateDocument } from "@/lib/domain/rental";
import { getDocumentCompanyName } from "@/lib/company-brand";
import { readRentalData } from "@/lib/services/rental-store";
import {
  buildReservationTemplateData,
  getReservationBaseTemplate,
  renderTemplateWithMacros,
} from "@/lib/services/template-renderer";

type ReservationConfirmationDocument = {
  reservation: Reservation;
  language: string;
  customerEmail: string;
  customerName: string;
  templateUsed: TemplateDocument | null;
  html: string;
};

export async function buildReservationConfirmationDocument(
  reservationId: string,
): Promise<ReservationConfirmationDocument> {
  const data = await readRentalData();
  const reservation = data.reservations.find((item) => item.id === reservationId);
  if (!reservation) {
    throw new Error("Reserva no encontrada");
  }

  const customer = reservation.customerId ? data.clients.find((item) => item.id === reservation.customerId) ?? null : null;
  const language = (customer?.language || "es").toLowerCase();
  const customerEmail = customer?.email || "";
  const customerName = reservation.customerName || customer?.companyName || customer?.commissionerName || "N/D";

  const templateUsed =
    data.templates.find(
      (template) => template.templateType === "CONFIRMACION_RESERVA" && template.language === language && template.active,
    ) ??
    data.templates.find(
      (template) => template.templateType === "CONFIRMACION_RESERVA" && template.language === "es" && template.active,
    ) ??
    null;

  const templateHtml = templateUsed?.htmlContent || getReservationBaseTemplate(language);
  const documentCompanyName = getDocumentCompanyName(data.companySettings);
  const renderedHtml = renderTemplateWithMacros(
    templateHtml,
    buildReservationTemplateData({
      language,
      reservation,
      customer,
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
    }),
  );

  return {
    reservation,
    language,
    customerEmail,
    customerName,
    templateUsed,
    html: renderedHtml,
  };
}
