import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildReservationConfirmationDocument } from "@/lib/services/reservation-confirmation-document-service";

export async function GET(_: Request, context: { params: Promise<{ reservationId: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { reservationId } = await context.params;

  try {
    const document = await buildReservationConfirmationDocument(reservationId);
    return new NextResponse(document.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"confirmacion-${document.reservation.reservationNumber}.html\"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error generando confirmacion";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
