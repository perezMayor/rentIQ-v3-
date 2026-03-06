import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { validateDataIntegrity } from "@/lib/services/rental-service";

type Step = { name: string; ok: boolean; detail: string };

function fail(step: string, detail: string): never {
  throw new Error(`[${step}] ${detail}`);
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/login`, { redirect: "manual" });
      if (res.status >= 200 && res.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("servidor no disponible");
}

async function main() {
  const providedBaseUrl = process.env.HEALTHCHECK_BASE_URL?.trim();
  const baseUrl = providedBaseUrl || "http://localhost:3215";
  const shouldManageServer = !providedBaseUrl;
  let child: ReturnType<typeof spawn> | null = null;
  let tempDataDir = "";
  let tempDistDirAbs = "";
  let tempDistDir = "";
  const steps: Step[] = [];

  try {
    if (shouldManageServer) {
      tempDataDir = await mkdtemp(path.join(os.tmpdir(), "rentiq-health-data-"));
      tempDistDirAbs = await mkdtemp(path.join(process.cwd(), ".next-health-dist-"));
      tempDistDir = path.basename(tempDistDirAbs);
      child = spawn(
        process.execPath,
        ["node_modules/next/dist/bin/next", "dev", "--port", "3215"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            RENTIQ_DATA_DIR: tempDataDir,
            NEXT_DIST_DIR: tempDistDir,
            NEXT_TELEMETRY_DISABLED: "1",
          },
          stdio: ["ignore", "ignore", "ignore"],
        },
      );
      await waitForServer(baseUrl, 45_000);
      steps.push({ name: "server_boot", ok: true, detail: "Servidor QA temporal operativo" });
    }

    const loginPage = await fetch(`${baseUrl}/login`, { redirect: "manual" });
    if (loginPage.status !== 200) {
      fail("http_login", `estado inesperado ${loginPage.status}`);
    }
    steps.push({ name: "http_login", ok: true, detail: "GET /login OK" });

    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      body: new URLSearchParams({
        email: "admin@rentiq.local",
        password: "Admin#2026",
      }),
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
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
    if (tempDistDirAbs) {
      await rm(tempDistDirAbs, { recursive: true, force: true });
    }
  }

  console.log("HEALTHCHECK OK");
  for (const step of steps) {
    console.log(`- ${step.name}: ${step.detail}`);
  }
}

main();
