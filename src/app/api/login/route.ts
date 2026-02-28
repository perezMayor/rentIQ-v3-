import { NextResponse } from "next/server";
import { getDemoUserByRole, ROLES, SESSION_COOKIE, type Role } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  // Login demo por rol (sin password en esta iteración).
  const formData = await request.formData();
  const role = String(formData.get("role") ?? "").toUpperCase() as Role;

  if (!ROLES.includes(role)) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const user = getDemoUserByRole(role);
  // Traza de autenticación para auditoría.
  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "AUTH_LOGIN",
    actorId: user.id,
    actorRole: user.role,
    entity: "session",
    entityId: user.id,
  });

  // Tras POST usamos 303 para forzar navegación GET en destino.
  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  // Cookie de sesión manual para evitar que el framework fuerce Secure en http local.
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${user.id}; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax`,
  );

  return response;
}
