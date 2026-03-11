import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("login correcto con admin y sucursal seleccionada", async ({ page }) => {
  await login(page, {
    email: "admin@rentiq.local",
    password: "Admin#2026",
    branch: "sur",
  });
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
});

test("login inválido muestra error", async ({ page }) => {
  await login(page, {
    email: "admin@rentiq.local",
    password: "wrong-password",
    expectSuccess: false,
  });

  await expect(page).toHaveURL(/\/login\?error=invalid/);
  await expect(page.getByText("Credenciales inválidas.")).toBeVisible();
});
