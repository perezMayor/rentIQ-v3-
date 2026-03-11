import { expect, type Page } from "@playwright/test";

type LoginInput = {
  email: string;
  password: string;
  branch?: string;
  expectSuccess?: boolean;
};

export async function login(page: Page, input: LoginInput) {
  await page.goto("/login");
  await page.selectOption("select[name='branch']", input.branch ?? "principal");
  await page.fill("input[name='email']", input.email);
  await page.fill("input[name='password']", input.password);
  await page.click("button[type='submit']");
  if (input.expectSuccess !== false) {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }
}

export async function loginAdmin(page: Page) {
  await login(page, {
    email: "admin@rentiq.local",
    password: "Admin#2026",
  });
}

export async function loginSuperAdmin(page: Page) {
  await login(page, {
    email: "superadmin@rentiq.local",
    password: "SuperAdmin#2026",
  });
}

export async function loginLector(page: Page) {
  await login(page, {
    email: "lector@rentiq.local",
    password: "Lector#2026",
  });
}
