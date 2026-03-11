import { NextResponse } from "next/server";
import { BRANCH_COOKIE, SESSION_COOKIE, validateCredentials } from "@/lib/auth";
import { DEFAULT_BRANCH_ID, normalizeBranchId } from "@/lib/branches";
import { appendAuditEvent } from "@/lib/audit";
import { getCompanySettings } from "@/lib/services/rental-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const settings = await getCompanySettings();
  const rawBranch = normalizeBranchId(String(formData.get("branch") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const validBranches = settings.branches.map((item) => normalizeBranchId(item.code));
  const branch = validBranches.includes(rawBranch) ? rawBranch : validBranches[0] ?? DEFAULT_BRANCH_ID;

  if (!email || !password) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "missing");
    if (branch) loginUrl.searchParams.set("branch", branch);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const user = await validateCredentials(email, password);
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    if (branch) loginUrl.searchParams.set("branch", branch);
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
  response.cookies.set(SESSION_COOKIE, user.id, {
    path: "/",
    maxAge: 28800,
    httpOnly: true,
    sameSite: "lax",
  });
  response.cookies.set(BRANCH_COOKIE, branch || DEFAULT_BRANCH_ID, {
    path: "/",
    maxAge: 28800,
    sameSite: "lax",
  });

  return response;
}
