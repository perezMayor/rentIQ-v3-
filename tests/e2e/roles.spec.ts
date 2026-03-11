import { expect, test } from "@playwright/test";
import { loginAdmin, loginLector, loginSuperAdmin } from "./helpers";

test("super-admin ve módulos de gestión completos", async ({ page }) => {
  await loginSuperAdmin(page);
  const nav = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(nav.getByRole("link", { name: "Vehículos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Facturación" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Gestor" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuración" })).toBeVisible();
});

test("admin ve módulos operativos completos", async ({ page }) => {
  await loginAdmin(page);
  const nav = page.getByRole("navigation", { name: "Navegación principal" });

  await expect(nav.getByRole("link", { name: "Vehículos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Facturación" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Gestor" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuración" })).toBeVisible();
});

test("lector no ve módulos bloqueados en menú", async ({ page }) => {
  await loginLector(page);

  await expect(page.getByRole("link", { name: "Vehículos" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Facturación" })).toHaveCount(0);
});

test("lector: accesos rápidos bloqueados muestran alerta y gastos sí abre", async ({ page }) => {
  await loginLector(page);

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
