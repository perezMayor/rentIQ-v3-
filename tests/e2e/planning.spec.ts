import { expect, test } from "@playwright/test";
import { loginAdmin } from "./helpers";

test("planning: carga principal, selector de sucursal y resumen por clic", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/planning-completo");

  await expect(page.locator("label", { hasText: "Sucursal" })).toBeVisible();
  await expect(page.locator("select[name='branch']").first()).toBeVisible();
  await expect(page.getByText("FLOTA")).toBeVisible();
  await expect(page.getByText("DÉFICIT POR GRUPO")).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
});

test("planning: resumen lateral por clic cuando hay celdas activas", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/planning-completo");
  const actionableCell = page.getByRole("button", { name: /Doble clic para abrir|\|/ }).first();
  const actionableCount = await page.getByRole("button", { name: /Doble clic para abrir|\|/ }).count();
  if (actionableCount === 0) {
    test.skip(true, "Sin celdas con reserva/contrato en el dataset actual.");
  }
  await expect(actionableCell).toBeVisible();
  await actionableCell.click();
  await expect(page).toHaveURL(/selected=/);
  await expect(page.getByRole("link", { name: "Cerrar resumen" })).toBeVisible();
});

test("planning: doble clic abre reserva/contrato", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/planning-completo");
  const draggableCell = page.locator("button[draggable='true']").first();
  const draggableCount = await page.locator("button[draggable='true']").count();
  if (draggableCount === 0) {
    test.skip(true, "Sin celdas draggeables en el dataset actual.");
  }
  await expect(draggableCell).toBeVisible();
  await draggableCell.dblclick();

  await expect(page).toHaveURL(/\/(reservas|contratos)\?/);
});

test("planning: huérfanas visibles y drag & drop operativo cuando existen", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/planning-completo");

  const hasHuerfana = (await page.getByText("Huerfana").count()) > 0;
  if (!hasHuerfana) {
    test.skip(true, "Sin filas huérfanas en el dataset actual.");
  }

  const source = page.locator("button[draggable='true']").first();
  const target = page.getByRole("button", { name: /Arrastra aquí para reasignar/ }).first();
  const canDrag = (await source.count()) > 0 && (await target.count()) > 0;
  if (!canDrag) {
    test.skip(true, "No hay combinación válida de origen/destino drag & drop.");
  }

  await source.dragTo(target);
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/planning-completo/);
});
