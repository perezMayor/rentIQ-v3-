import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { reassignReservationFromPlanning } from "@/lib/services/rental-service";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }
  if (user.role === "LECTOR") {
    return NextResponse.json({ ok: false, error: "Permiso denegado" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      reservationId?: string;
      targetPlate?: string;
      sourceStatus?: "PETICION" | "RESERVA_CONFIRMADA" | "RESERVA_HUERFANA" | "CONTRATADO" | "BLOQUEADO" | "NO_DISPONIBLE" | "";
      sourceGroup?: string;
      targetGroup?: string;
    };

    const result = await reassignReservationFromPlanning(
      {
        reservationId: body.reservationId ?? "",
        targetPlate: body.targetPlate ?? "",
        sourceStatus: body.sourceStatus ?? "",
        sourceGroup: body.sourceGroup ?? "",
        targetGroup: body.targetGroup ?? "",
      },
      { id: user.id, role: user.role },
    );

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      warning:
        result.crossGroup && result.changed
          ? `Aviso: se ha reasignado con cambio de grupo (${result.sourceGroup || "N/D"} → ${result.targetGroup || "N/D"}).`
          : "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se ha podido reasignar la reserva";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
