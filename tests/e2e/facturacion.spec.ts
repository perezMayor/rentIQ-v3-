import { expect, test, type Page } from "@playwright/test";
import { loginAdmin } from "./helpers";

async function createManualInvoice(page: Page, invoiceType: "F" | "V" | "R" | "A") {
  await page.goto(`/facturacion?tab=crear-factura&invoiceType=${invoiceType}`);
  await expect(page.getByRole("heading", { name: "Crear factura manual" })).toBeVisible();

  const branchValue = await page.locator("select[name='branchCode'] option").evaluateAll((options) => {
    const available = options
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value && value !== "");
    return available[0] ?? "SUC-ND";
  });
  await page.locator("select[name='branchCode']").selectOption(branchValue);
  await page.locator("input[name='invoiceName']").fill(`QA ${invoiceType} ${Date.now()}`);
  await page.locator("input[name='manualCustomerName']").fill("Cliente QA Facturación");
  await page.locator("input[name='manualCustomerTaxId']").fill("B00000000");
  await page.locator("input[name='manualCustomerEmail']").fill("qa-facturacion@rentiq.local");
  await page.locator("input[name='manualCustomerAddress']").fill("Calle QA 123");
  await page.locator("input[name='baseAmount']").fill("100");
  await page.locator("input[name='ivaPercent']").fill("21");
  await page.locator("select[name='invoiceType']").selectOption(invoiceType);
  await page.getByRole("button", { name: "Crear factura" }).click();

  await expect(page).toHaveURL(/\/facturacion\?tab=facturas/);
}

test("facturación: diario carga, filtra y exporta", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/facturacion?tab=facturas");

  await expect(page.getByRole("link", { name: "Diario" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buscar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exportar CSV" })).toBeVisible();

  await page.locator("input[name='q']").fill("F");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/tab=facturas/);
});

test("facturación: crear factura manual F/V/R/A", async ({ page }) => {
  await loginAdmin(page);

  await createManualInvoice(page, "F");
  await createManualInvoice(page, "V");
  await createManualInvoice(page, "R");
  await createManualInvoice(page, "A");

  const table = page.locator("table.data-table").first();
  await expect(table).toContainText("F");
  await expect(table).toContainText("V");
  await expect(table).toContainText("R");
  await expect(table).toContainText("A");

  const invoiceCellText = (await page.locator("table.data-table tbody tr td").first().textContent())?.trim() ?? "";
  expect(invoiceCellText).toMatch(/^[FVAR]/);
});

test("facturación: pestañas gastos, conciliación, envíos y estadísticas/canales", async ({ page }) => {
  await loginAdmin(page);

  await page.goto("/facturacion?tab=gastos");
  await expect(page.getByRole("heading", { name: "Diario contable" })).toBeVisible();

  await page.goto("/facturacion?tab=conciliacion");
  await expect(page.getByRole("heading", { name: "Cierre de contratos y conciliación" })).toBeVisible();

  await page.goto("/facturacion?tab=envios");
  await expect(page.getByRole("heading", { name: "Logs de facturas enviadas" })).toBeVisible();

  await page.goto("/facturacion?tab=estadisticas&statsTab=canales");
  await expect(page.getByRole("heading", { name: "Estadísticas" })).toBeVisible();
  await expect(page.getByRole("table").first()).toContainText("Canal");

  await page.locator("input[name='customSalesChannelName']").fill(`QA-CANAL-${Date.now()}`);
  await page.getByRole("button", { name: "Añadir canal" }).click();
  await expect(page).toHaveURL(/statsTab=canales/);
  await expect(page).toHaveURL(/addedChannel=QA-CANAL-/);
});
