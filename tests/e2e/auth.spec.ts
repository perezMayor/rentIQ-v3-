import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, input: {
  email: string;
  password: string;
  branch?: string;
}) {
  await page.goto("/login");
  if (input.branch) {
    await page.selectOption("select[name='branch']", input.branch);
  }
  await page.fill("input[name='email']", input.email);
  await page.fill("input[name='password']", input.password);
  await page.click("button[type='submit']");
}

test("login correcto con admin y sucursal seleccionada", async ({ page }) => {
  await login(page, {
    email: "admin@rentiq.local",
    password: "Admin#2026",
    branch: "sur",
  });

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
});

test("login inválido muestra error", async ({ page }) => {
  await login(page, {
    email: "admin@rentiq.local",
    password: "wrong-password",
  });

  await expect(page).toHaveURL(/\/login\?error=invalid/);
  await expect(page.getByText("Credenciales inválidas.")).toBeVisible();
});
