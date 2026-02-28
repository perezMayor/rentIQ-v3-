import { validateDataIntegrity } from "@/lib/services/rental-service";

type Step = { name: string; ok: boolean; detail: string };

function fail(step: string, detail: string): never {
  throw new Error(`[${step}] ${detail}`);
}

async function main() {
  const baseUrl = process.env.HEALTHCHECK_BASE_URL?.trim() || "http://127.0.0.1:3203";
  const steps: Step[] = [];

  try {
    const loginPage = await fetch(`${baseUrl}/login`, { redirect: "manual" });
    if (loginPage.status !== 200) {
      fail("http_login", `estado inesperado ${loginPage.status}`);
    }
    steps.push({ name: "http_login", ok: true, detail: "GET /login OK" });

    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      body: new URLSearchParams({ role: "ADMIN" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    if (loginRes.status !== 303) {
      fail("auth_login_redirect", `esperado 303 y llegó ${loginRes.status}`);
    }
    const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    if (!cookie.includes("rq_v3_session=")) {
      fail("auth_login_cookie", "cookie de sesión ausente");
    }
    steps.push({ name: "auth_login", ok: true, detail: "POST /api/login OK + cookie" });

    const dashboard = await fetch(`${baseUrl}/dashboard`, { headers: { cookie }, redirect: "manual" });
    if (dashboard.status !== 200) {
      fail("auth_dashboard", `estado inesperado ${dashboard.status}`);
    }
    steps.push({ name: "auth_dashboard", ok: true, detail: "GET /dashboard autenticado OK" });

    const logout = await fetch(`${baseUrl}/api/logout`, { method: "POST", headers: { cookie }, redirect: "manual" });
    if (logout.status !== 303) {
      fail("auth_logout_redirect", `esperado 303 y llegó ${logout.status}`);
    }
    if (!(logout.headers.get("set-cookie") ?? "").includes("Max-Age=0")) {
      fail("auth_logout_cookie", "cookie no invalidada");
    }
    steps.push({ name: "auth_logout", ok: true, detail: "POST /api/logout OK" });

    const dataCheck = await validateDataIntegrity();
    if (!dataCheck.ok) {
      fail("data_integrity", `incidencias=${dataCheck.totalIssues}`);
    }
    steps.push({ name: "data_integrity", ok: true, detail: "Integridad de datos OK" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`HEALTHCHECK FAIL ${message}`);
    process.exit(1);
  }

  console.log("HEALTHCHECK OK");
  for (const step of steps) {
    console.log(`- ${step.name}: ${step.detail}`);
  }
}

main();
