export type VisualTemplateType = "CONFIRMACION_RESERVA" | "PRESUPUESTO";

export type VisualTemplateConfig = {
  title: string;
  intro: string;
  footer: string;
  showCompany: boolean;
  showReservationBlock: boolean;
  showBaseData: boolean;
  showPricingBlock: boolean;
  showExtrasTable: boolean;
  showObservations: boolean;
};

const MARKER = "VISUAL_TEMPLATE:";

export function defaultVisualTemplateConfig(templateType: VisualTemplateType, language: string): VisualTemplateConfig {
  const isEn = language.toLowerCase().startsWith("en");
  if (templateType === "PRESUPUESTO") {
    return {
      title: isEn ? "Quotation" : "Presupuesto",
      intro: isEn ? "Estimated rental pricing." : "Estimación económica del alquiler.",
      footer: "{{company_document_footer}}",
      showCompany: true,
      showReservationBlock: false,
      showBaseData: true,
      showPricingBlock: true,
      showExtrasTable: true,
      showObservations: false,
    };
  }
  return {
    title: isEn ? "Booking confirmation" : "Confirmación de reserva",
    intro: isEn ? "Your booking has been registered with the following details." : "Su reserva ha quedado registrada con los siguientes datos.",
    footer: "{{company_document_footer}}",
    showCompany: true,
    showReservationBlock: true,
    showBaseData: false,
    showPricingBlock: true,
    showExtrasTable: true,
    showObservations: true,
  };
}

export function encodeVisualTemplateConfig(templateType: VisualTemplateType, config: VisualTemplateConfig, html: string): string {
  const payload = Buffer.from(JSON.stringify({ templateType, config }), "utf8").toString("base64");
  return `<!-- ${MARKER}${payload} -->\n${html}`;
}

export function decodeVisualTemplateConfig(htmlContent: string): { templateType: VisualTemplateType; config: VisualTemplateConfig } | null {
  const match = htmlContent.match(/^\s*<!--\s*VISUAL_TEMPLATE:([^\s]+)\s*-->/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as { templateType: VisualTemplateType; config: VisualTemplateConfig };
    if (!parsed?.templateType || !parsed?.config) return null;
    return parsed;
  } catch {
    return null;
  }
}

function layoutStyles() {
  return `font-family:'Poppins','Segoe UI',Arial,sans-serif;color:#0f172a;max-width:920px;margin:0 auto;padding:18px;`;
}

function box(title: string, body: string) {
  return `
  <section style="border:1px solid #cbd5e1;border-radius:14px;padding:14px;background:#fff;">
    <h3 style="margin:0 0 10px 0;font-size:18px;line-height:1.2;color:#1d4ed8;">${title}</h3>
    ${body}
  </section>`;
}

function pair(label: string, value: string) {
  return `<div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px;padding:6px 0;border-bottom:1px solid #e2e8f0;"><strong style="color:#475569;">${label}</strong><span>${value}</span></div>`;
}

function moneyRow(label: string, value: string, strong = false) {
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:10px;padding:7px 0;border-bottom:1px solid #e2e8f0;${strong ? "font-weight:700;" : ""}"><span>${label}</span><span style="text-align:right;">${value}</span></div>`;
}

export function buildVisualTemplateHtml(templateType: VisualTemplateType, language: string, config: VisualTemplateConfig): string {
  const isEn = language.toLowerCase().startsWith("en");
  const companyBlock = config.showCompany
    ? `
      <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid #dbe4f1;padding-bottom:12px;margin-bottom:14px;">
        <div>
          <h2 style="margin:0 0 6px 0;font-size:28px;line-height:1.1;">${config.title}</h2>
          ${config.intro ? `<p style="margin:0;color:#475569;font-size:13px;">${config.intro}</p>` : ""}
        </div>
        <div style="text-align:right;max-width:320px;">
          <div style="font-weight:700;">{{company_document_name}}</div>
          <div style="font-size:13px;color:#475569;">{{company_phone}}</div>
          <div style="font-size:13px;color:#475569;">{{company_email_from}}</div>
        </div>
      </div>`
    : `
      <div style="margin-bottom:14px;">
        <h2 style="margin:0 0 6px 0;font-size:28px;line-height:1.1;">${config.title}</h2>
        ${config.intro ? `<p style="margin:0;color:#475569;font-size:13px;">${config.intro}</p>` : ""}
      </div>`;

  if (templateType === "PRESUPUESTO") {
    const baseData = config.showBaseData
      ? box(
          isEn ? "Price basis" : "Base del presupuesto",
          [
            pair(isEn ? "Delivery" : "Entrega", "{{delivery_date}} {{delivery_time}} · {{delivery_place}}"),
            pair(isEn ? "Return" : "Recogida", "{{pickup_date}} {{pickup_time}} · {{pickup_place}}"),
            pair(isEn ? "Tariff" : "Tarifa", "{{applied_rate}}"),
            pair(isEn ? "Group" : "Grupo", "{{billed_car_group}}"),
            pair(isEn ? "Billed days" : "Días facturados", "{{billed_days}}"),
          ].join(""),
        )
      : "";
    const pricing = config.showPricingBlock
      ? box(
          isEn ? "Quotation breakdown" : "Desglose económico",
          [
            moneyRow(isEn ? "Rent" : "Alquiler", "{{base_amount}}"),
            moneyRow(isEn ? "Discount" : "Descuento", "{{discount_amount}}"),
            moneyRow(isEn ? "Insurance" : "Seguros", "{{insurance_amount}}"),
            moneyRow(isEn ? "Extras" : "Extras", "{{extras_amount}}"),
            moneyRow(isEn ? "Fuel" : "Combustible", "{{fuel_amount}}"),
            moneyRow(isEn ? "Total" : "Total", "{{total_amount}}", true),
          ].join(""),
        )
      : "";
    const extras = config.showExtrasTable
      ? box(
          isEn ? "Concept details" : "Detalle de conceptos",
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div>
              <h4 style="margin:0 0 8px 0;font-size:14px;">${isEn ? "Insurance" : "Seguros"}</h4>
              <table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>
                <tr><td>{extra#01}</td><td style="text-align:right;">{extra#01total}</td></tr>
                <tr><td>{extra#02}</td><td style="text-align:right;">{extra#02total}</td></tr>
              </tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 8px 0;font-size:14px;">${isEn ? "Extras" : "Extras"}</h4>
              <table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>
                <tr><td>{extra#03}</td><td style="text-align:right;">{extra#03total}</td></tr>
                <tr><td>{extra#04}</td><td style="text-align:right;">{extra#04total}</td></tr>
                <tr><td>{extra#05}</td><td style="text-align:right;">{extra#05total}</td></tr>
                <tr><td>{extra#06}</td><td style="text-align:right;">{extra#06total}</td></tr>
              </tbody></table>
            </div>
          </div>`,
        )
      : "";
    return encodeVisualTemplateConfig(
      templateType,
      config,
      `<section style="${layoutStyles()}">${companyBlock}<div style="display:grid;gap:14px;">${baseData}${pricing}${extras}</div>${config.footer ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #dbe4f1;font-size:12px;color:#64748b;">${config.footer}</div>` : ""}</section>`.trim(),
    );
  }

  const reservationBlock = config.showReservationBlock
    ? box(
        isEn ? "Reservation details" : "Datos de reserva",
        [
          pair(isEn ? "Reservation" : "Reserva", "{{reservation_number}}"),
          pair(isEn ? "Group" : "Grupo", "{{billed_car_group}}"),
          pair(isEn ? "Delivery" : "Entrega", "{{delivery_date}} {{delivery_time}} · {{delivery_place}}"),
          pair(isEn ? "Return" : "Recogida", "{{pickup_date}} {{pickup_time}} · {{pickup_place}}"),
          pair(isEn ? "Days" : "Días", "{{billed_days}}"),
        ].join(""),
      )
    : "";
  const pricingBlock = config.showPricingBlock
    ? box(
        isEn ? "Billing summary" : "Resumen económico",
        [
          moneyRow(isEn ? "Rent" : "Alquiler", "{{base_amount}}"),
          moneyRow(isEn ? "Discount" : "Descuento", "{{discount_amount}}"),
          moneyRow(isEn ? "Insurance" : "Seguros", "{{insurance_amount}}"),
          moneyRow(isEn ? "Extras" : "Extras", "{{extras_amount}}"),
          moneyRow(isEn ? "Fuel" : "Combustible", "{{fuel_amount}}"),
          moneyRow(isEn ? "Total" : "Total", "{{total_amount}}", true),
        ].join(""),
      )
    : "";
  const extrasBlock = config.showExtrasTable
    ? box(
        isEn ? "Extra detail" : "Detalle de extras",
        `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>
          <tr><td>{extra#01}</td><td>{extra#01unit}</td><td style="text-align:right;">{extra#01total}</td></tr>
          <tr><td>{extra#02}</td><td>{extra#02unit}</td><td style="text-align:right;">{extra#02total}</td></tr>
          <tr><td>{extra#03}</td><td>{extra#03unit}</td><td style="text-align:right;">{extra#03total}</td></tr>
          <tr><td>{extra#04}</td><td>{extra#04unit}</td><td style="text-align:right;">{extra#04total}</td></tr>
          <tr><td>{extra#05}</td><td>{extra#05unit}</td><td style="text-align:right;">{extra#05total}</td></tr>
          <tr><td>{extra#06}</td><td>{extra#06unit}</td><td style="text-align:right;">{extra#06total}</td></tr>
        </tbody></table>`,
      )
    : "";
  const obsBlock = config.showObservations
    ? box(isEn ? "Remarks" : "Observaciones", `<div style="font-size:14px;line-height:1.45;">{{observations}}</div>`)
    : "";
  return encodeVisualTemplateConfig(
    templateType,
    config,
    `<section style="${layoutStyles()}">${companyBlock}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">${reservationBlock}${pricingBlock}</div><div style="display:grid;gap:14px;margin-top:14px;">${extrasBlock}${obsBlock}</div>${config.footer ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #dbe4f1;font-size:12px;color:#64748b;">${config.footer}</div>` : ""}</section>`.trim(),
  );
}
