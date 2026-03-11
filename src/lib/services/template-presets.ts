// Servicio de negocio para template presets.
import { getBudgetBaseTemplate, getReservationBaseTemplate } from "@/lib/services/template-renderer";

type TemplateType = "CONTRATO" | "CONFIRMACION_RESERVA" | "PRESUPUESTO" | "FACTURA";

export function getTemplatePresetHtml(templateType: TemplateType, language: string): string {
  const lang = language.toLowerCase();
  if (templateType === "CONFIRMACION_RESERVA") {
    return getReservationBaseTemplate(lang);
  }

  if (templateType === "PRESUPUESTO") {
    return getBudgetBaseTemplate(lang);
  }

  if (templateType === "FACTURA") {
    if (lang.startsWith("en")) {
      return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:820px;margin:0 auto;padding:16px;">
  <h2 style="margin:0 0 6px 0;">Invoice {{invoice_number}}</h2>
  <p style="margin:0 0 12px 0;color:#475569;">{{company_document_name}}</p>
  <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
    <p><strong>Customer:</strong> {{customer_name}}</p>
    <p><strong>Contract:</strong> {{contract_number}}</p>
    <p><strong>Date:</strong> {{issued_at}}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">
    <p><strong>Base:</strong> {{base_amount}}</p>
    <p><strong>Extras:</strong> {{extras_amount}}</p>
    <p><strong>Insurance:</strong> {{insurance_amount}}</p>
    <p><strong>Penalties:</strong> {{penalties_amount}}</p>
    <p><strong>VAT ({{iva_percent}}%):</strong> {{iva_amount}}</p>
    <p><strong>Total:</strong> {{total_amount}}</p>
  </div>
  <p style="margin-top:10px;font-size:12px;color:#64748b;">{{company_document_footer}}</p>
</section>
      `.trim();
    }
    return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:820px;margin:0 auto;padding:16px;">
  <h2 style="margin:0 0 6px 0;">Factura {{invoice_number}}</h2>
  <p style="margin:0 0 12px 0;color:#475569;">{{company_document_name}}</p>
  <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;">
    <p><strong>Cliente:</strong> {{customer_name}}</p>
    <p><strong>Contrato:</strong> {{contract_number}}</p>
    <p><strong>Fecha:</strong> {{issued_at}}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">
    <p><strong>Base:</strong> {{base_amount}}</p>
    <p><strong>Extras:</strong> {{extras_amount}}</p>
    <p><strong>Seguros:</strong> {{insurance_amount}}</p>
    <p><strong>Penalizaciones:</strong> {{penalties_amount}}</p>
    <p><strong>IVA ({{iva_percent}}%):</strong> {{iva_amount}}</p>
    <p><strong>Total:</strong> {{total_amount}}</p>
  </div>
  <p style="margin-top:10px;font-size:12px;color:#64748b;">{{company_document_footer}}</p>
</section>
    `.trim();
  }

  if (lang.startsWith("en")) {
    return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:820px;margin:0 auto;padding:16px;">
  <h2>Blank rental contract</h2>
  <p>{{company_document_name}}</p>
  <p><strong>Customer:</strong> _______________________</p>
  <p><strong>Document:</strong> _______________________</p>
  <p><strong>Driving license:</strong> _______________________</p>
  <p><strong>Delivery / Return:</strong> _______________________</p>
  <p><strong>Group / Plate:</strong> _______________________</p>
</section>
    `.trim();
  }
  return `
<section style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:820px;margin:0 auto;padding:16px;">
  <h2>Contrato en blanco</h2>
  <p>{{company_document_name}}</p>
  <p><strong>Cliente:</strong> _______________________</p>
  <p><strong>Documento:</strong> _______________________</p>
  <p><strong>Carné conducir:</strong> _______________________</p>
  <p><strong>Entrega / Recogida:</strong> _______________________</p>
  <p><strong>Grupo / Matrícula:</strong> _______________________</p>
</section>
  `.trim();
}
