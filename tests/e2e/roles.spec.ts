import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, input: { email: string; password: string; branch?: string }) {
  await page.goto("/login");
  await page.selectOption("select[name='branch']", input.branch ?? "principal");
  await page.fill("input[name='email']", input.email);
  await page.fill("input[name='password']", input.password);
  await page.click("button[type='submit']");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("super-admin ve módulos de gestión completos", async ({ page }) => {
  await login(page, {
    email: "superadmin@rentiq.local",
    password: "SuperAdmin#2026",
  });
  const nav = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(nav.getByRole("link", { name: "Vehículos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Facturación" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Gestor" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuración" })).toBeVisible();
});

test("admin ve módulos operativos completos", async ({ page }) => {
  await login(page, {
    email: "admin@rentiq.local",
    password: "Admin#2026",
  });
  const nav = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(nav.getByRole("link", { name: "Vehículos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Facturación" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Gestor" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuración" })).toBeVisible();
});

test("lector no ve módulos bloqueados en menú", async ({ page }) => {
  await login(page, {
    email: "lector@rentiq.local",
    password: "Lector#2026",
  });

  await expect(page.getByRole("link", { name: "Vehículos" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Facturación" })).toHaveCount(0);
});

test("lector: accesos rápidos bloqueados muestran alerta y gastos sí abre", async ({ page }) => {
  await login(page, {
    email: "lector@rentiq.local",
    password: "Lector#2026",
  });

  await page.getByRole("link", { name: "Nueva reserva" }).click();
  await expect(page).toHaveURL(/\/dashboard\?error=permission/);
  await expect(page.getByText("Este usuario no tiene permiso para realizar esta acción.")).toBeVisible();

  await page.getByRole("link", { name: "Nuevo contrato" }).click();
  await expect(page).toHaveURL(/\/dashboard\?error=permission/);

  await page.getByRole("link", { name: "Planning" }).click();
  await expect(page).toHaveURL(/\/dashboard\?error=permission/);

  await page.getByRole("link", { name: "Gastos" }).click();
  await expect(page).toHaveURL(/\/gastos/);
});
