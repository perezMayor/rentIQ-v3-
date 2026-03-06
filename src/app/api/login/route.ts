import { NextResponse } from "next/server";
import { BRANCH_COOKIE, SESSION_COOKIE, validateDemoCredentials } from "@/lib/auth";
import { DEFAULT_BRANCH_ID, isBranchId } from "@/lib/branches";
import { appendAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  // Login demo por email con permisos derivados del usuario asociado.
  const formData = await request.formData();
  const rawBranch = String(formData.get("branch") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const branch = isBranchId(rawBranch) ? rawBranch : DEFAULT_BRANCH_ID;

  if (!email || !password) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "missing");
    loginUrl.searchParams.set("branch", branch);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const user = validateDemoCredentials(email, password);
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("branch", branch);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

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
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${user.id}; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax`);
  response.headers.append("Set-Cookie", `${BRANCH_COOKIE}=${branch}; Path=/; Max-Age=28800; SameSite=Lax`);

  return response;
}
