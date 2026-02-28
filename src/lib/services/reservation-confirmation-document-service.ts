import type { Reservation, TemplateDocument } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type ReservationConfirmationDocument = {
  reservation: Reservation;
  language: string;
  customerEmail: string;
  customerName: string;
  templateUsed: TemplateDocument | null;
  html: string;
};

function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => data[key] ?? "");
}

function getDefaultReservationConfirmationTemplate(): string {
  return `
    <section>
      <h1>{{company_name}}</h1>
      <h2>Confirmación reserva {{reservation_number}}</h2>
      <p>Cliente: {{customer_name}}</p>
      <p>Entrega: {{delivery_at}} - {{delivery_place}}</p>
      <p>Recogida: {{pickup_at}} - {{pickup_place}}</p>
      <p>Grupo reservado: {{billed_car_group}}</p>
      <p>Matrícula: {{assigned_plate}}</p>
      <p>Total previsto: {{total_amount}}</p>
      <p>Canal: {{sales_channel}}</p>
    </section>
  `;
}

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

  const templateHtml = templateUsed?.htmlContent || getDefaultReservationConfirmationTemplate();
  const renderedHtml = renderTemplate(templateHtml, {
    company_name: data.companySettings.companyName,
    reservation_number: reservation.reservationNumber,
    customer_name: customerName,
    delivery_at: reservation.deliveryAt || "N/D",
    delivery_place: reservation.deliveryPlace || "N/D",
    pickup_at: reservation.pickupAt || "N/D",
    pickup_place: reservation.pickupPlace || "N/D",
    billed_car_group: reservation.billedCarGroup || "N/D",
    assigned_plate: reservation.assignedPlate || "N/D",
    total_amount: reservation.totalPrice.toFixed(2),
    sales_channel: reservation.salesChannel || "N/D",
  });

  return {
    reservation,
    language,
    customerEmail,
    customerName,
    templateUsed,
    html: renderedHtml,
  };
}
