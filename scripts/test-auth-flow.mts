import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

const PORT = 3213;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/login`, { redirect: "manual" });
      if (res.status >= 200 && res.status < 400) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Servidor no disponible para test auth");
}

async function run() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "rentiq-auth-flow-"));
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, RENTIQ_DATA_DIR: dataDir, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForServer(BASE_URL, 30_000);

    const loginPayload = new URLSearchParams({ role: "ADMIN" });
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      body: loginPayload,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    assert.equal(loginRes.status, 303);
    assert.ok((loginRes.headers.get("location") ?? "").endsWith("/dashboard"));
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.includes("rq_v3_session=u-admin"));

    const cookie = setCookie.split(";")[0];
    const dashboardRes = await fetch(`${BASE_URL}/dashboard`, { headers: { cookie }, redirect: "manual" });
    assert.equal(dashboardRes.status, 200);

    const logoutRes = await fetch(`${BASE_URL}/api/logout`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(logoutRes.status, 303);
    assert.ok((logoutRes.headers.get("location") ?? "").endsWith("/login"));
    assert.ok((logoutRes.headers.get("set-cookie") ?? "").includes("Max-Age=0"));

    const noSessionDashboard = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
    assert.ok(noSessionDashboard.status === 307 || noSessionDashboard.status === 302 || noSessionDashboard.status === 303);
    assert.ok((noSessionDashboard.headers.get("location") ?? "").endsWith("/login"));

    console.log("OK test:auth");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await rm(dataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
