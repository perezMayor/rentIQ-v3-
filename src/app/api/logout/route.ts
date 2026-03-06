import { NextResponse } from "next/server";
import { BRANCH_COOKIE, SESSION_COOKIE, getSessionUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  // Si hay sesión, se registra el cierre antes de invalidar cookie.
  const user = await getSessionUser();

  if (user) {
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "AUTH_LOGOUT",
      actorId: user.id,
      actorRole: user.role,
      entity: "session",
      entityId: user.id,
    });
  }

  // Tras POST usamos 303 para forzar navegación GET en destino.
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Invalidación explícita de cookie de sesión (sin Secure para entorno http local).
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  response.headers.append("Set-Cookie", `${BRANCH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
