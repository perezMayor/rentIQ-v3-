import { sendMailFromCompany } from "@/lib/mail";
import type { RoleName } from "@/lib/domain/rental";
import { buildInvoiceDocument } from "@/lib/services/invoice-document-service";
import { getCompanySettings, recordInvoiceSendLog } from "@/lib/services/rental-service";

export async function sendInvoiceUsingTemplate(input: {
  invoiceId: string;
  toEmail: string;
  actor: { id: string; role: RoleName };
}) {
  // 1) Construye documento final (HTML + PDF) según plantilla activa.
  const document = await buildInvoiceDocument(input.invoiceId);
  // 2) Lee configuración de remitente de empresa.
  const settings = await getCompanySettings();
  // 3) Prioriza email escrito en formulario; si no, usa email del cliente.
  const toEmail = input.toEmail.trim() || document.customerEmail;

  if (!toEmail) {
    throw new Error("No hay email destino en cliente ni en formulario");
  }

  const mailFrom = settings.companyEmailFrom !== "N/D" ? settings.companyEmailFrom : undefined;

  try {
    // Envío SMTP real con adjunto PDF.
    await sendMailFromCompany({
      fromOverride: mailFrom,
      to: toEmail,
      subject: `${document.invoice.invoiceNumber} - ${document.invoice.invoiceName}`,
      html: document.html,
      attachments: [
        {
          filename: `${document.invoice.invoiceNumber}.pdf`,
          content: document.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await recordInvoiceSendLog(input.invoiceId, toEmail, "ENVIADA", input.actor);
  } catch (error) {
    // Registra también los intentos fallidos para trazabilidad completa.
    await recordInvoiceSendLog(input.invoiceId, toEmail, "ERROR", input.actor);
    throw error;
  }
}
