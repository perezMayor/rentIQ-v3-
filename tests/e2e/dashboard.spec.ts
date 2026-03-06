import { expect, test, type Page } from "@playwright/test";

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.selectOption("select[name='branch']", "principal");
  await page.fill("input[name='email']", "admin@rentiq.local");
  await page.fill("input[name='password']", "Admin#2026");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("dashboard: KPIs superiores y cards principales", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/dashboard");

  await expect(page.getByText(/^Entregas hoy$/)).toBeVisible();
  await expect(page.getByText(/^Recogidas hoy$/)).toBeVisible();
  await expect(page.getByText(/^Tareas pendientes$/)).toBeVisible();

  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
  await expect(page.getByLabel("dashboard-operativo").getByRole("link", { name: "Reservas" })).toBeVisible();
  await expect(page.getByLabel("dashboard-operativo").getByRole("link", { name: "Contratos" })).toBeVisible();
});

test("dashboard: alertas desplegables funcionales", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/dashboard");

  const recogidas = page.locator("details").filter({ hasText: "Recogidas" }).first();
  const entregas = page.locator("details").filter({ hasText: "Entregas" }).first();
  const operaciones = page.locator("details").filter({ hasText: "Operaciones" }).first();

  await expect(recogidas).toBeVisible();
  await expect(entregas).toBeVisible();
  await expect(operaciones).toBeVisible();

  await expect(recogidas.locator("summary")).toBeVisible();
  await expect(entregas.locator("summary")).toBeVisible();
  await expect(operaciones.locator("summary")).toBeVisible();
});

test("dashboard: resumen mensual y previsión con rango", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Resumen mensual" })).toBeVisible();
  await expect(page.locator("select[name='year']")).toBeVisible();
  await page.locator("button", { hasText: /^Reservas$/ }).first().click();
  await expect(page).toHaveURL(/metric=reservas/);

  const monthlyRows = page.locator("div").filter({ has: page.locator("span", { hasText: /Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic/ }) });
  await expect(monthlyRows.first()).toBeVisible();

  await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();
  const fromInput = page.locator("input[name='from'][type='date']");
  const toInput = page.locator("input[name='to'][type='date']");
  await expect(fromInput).toBeVisible();
  await expect(toInput).toBeVisible();
  await expect(page.getByText("Saldo global")).toBeVisible();

  await fromInput.fill("2026-01-01");
  await toInput.fill("2026-12-31");
  await page.getByRole("button", { name: "Aplicar" }).last().click();
  await expect(page).toHaveURL(/from=2026-01-01/);
  await expect(page).toHaveURL(/to=2026-12-31/);
});
