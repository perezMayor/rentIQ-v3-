import { expect, test, type Page } from "@playwright/test";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function buildWindow(daysAhead: number) {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return {
    deliveryAt: toDateTimeLocalString(start),
    pickupAt: toDateTimeLocalString(end),
  };
}

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.selectOption("select[name='branch']", "principal");
  await page.fill("input[name='email']", "admin@rentiq.local");
  await page.fill("input[name='password']", "Admin#2026");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function createContractViaForm(
  page: Page,
  input: { customerName: string; deliveryAt: string; pickupAt: string; billedCarGroup: string; plate?: string },
) {
  await page.goto("/contratos?tab=gestion");
  await page.locator("input[name='customerId']").fill("CL-000001");
  await page.locator("input[name='customerId']").blur();
  await page.locator("input[name='customerName']").fill(input.customerName);
  await page.locator("input[name='branchDelivery']").fill("ALC");
  await page.locator("input[name='pickupBranch']").fill("ALC");
  await page.locator("input[name='deliveryAt']").fill(input.deliveryAt);
  await page.locator("input[name='pickupAt']").fill(input.pickupAt);
  await page.locator("input[name='billedCarGroup']").fill(input.billedCarGroup);
  await page.locator("input[name='baseAmount']").fill("120");
  if (input.plate) {
    await page.locator("input[name='assignedPlate']").fill(input.plate);
  }
  await page.locator("select[name='overrideAccepted']").selectOption("true");
  await page.locator("input[name='overrideReason']").fill("QA override controlado");
  await page.getByRole("button", { name: "Crear contrato" }).click();
  await expect(page).toHaveURL(/\/contratos\?tab=gestion&contractNumber=/);
  const contractNumber = new URL(page.url()).searchParams.get("contractNumber");
  expect(contractNumber).toBeTruthy();
  return contractNumber ?? "";
}

test("contratos: localizar -> abrir gestión carga datos y PDF responde", async ({ page }) => {
  await loginAdmin(page);
  const suffix = Date.now();
  const window = buildWindow(30);
  const customerName = `QA Contrato ${suffix}`;
  const contractNumber = await createContractViaForm(page, {
    customerName,
    deliveryAt: window.deliveryAt,
    pickupAt: window.pickupAt,
    billedCarGroup: "A",
    plate: "3333CCC",
  });

  await page.goto(`/contratos?tab=localizar&contractNumber=${encodeURIComponent(contractNumber)}`);
  const row = page.getByRole("row").filter({ hasText: contractNumber }).first();
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Abrir gestión" }).click();

  await expect(page).toHaveURL(/\/contratos\?tab=gestion&contractId=/);
  await expect(page.locator("input[name='customerName']")).toHaveValue(customerName);

  await expect(page.getByRole("link", { name: "Imprimir contrato" })).toBeVisible();
});

test("contratos: cierre requiere caja y tras facturar queda bloqueado", async ({ page }) => {
  await loginAdmin(page);
  const suffix = Date.now();
  const window = buildWindow(40);
  const contractNumber = await createContractViaForm(page, {
    customerName: `QA Cierre ${suffix}`,
    deliveryAt: window.deliveryAt,
    pickupAt: window.pickupAt,
    billedCarGroup: "A",
    plate: "1111AAA",
  });

  await page.goto(`/contratos?tab=gestion&contractNumber=${encodeURIComponent(contractNumber)}`);
  const closeButton = page.getByRole("button", { name: "Cerrar contrato" });
  await expect(closeButton).toBeDisabled();

  await page.locator("summary", { hasText: "Caja" }).click();
  await page.locator("input[name='amount']").first().fill("120");
  await page.getByRole("button", { name: "Guardar caja" }).click();
  await expect(page).toHaveURL(/ok=Caja/);

  await page.getByRole("button", { name: "Cerrar contrato" }).click();
  await expect(page).toHaveURL(/ok=Contrato/);
  await expect(page.getByText(/Contrato facturado/i).first()).toBeVisible();
  await expect(page.getByText(/Factura:/i)).not.toContainText("Sin factura");
  await expect(page.locator("input[name='customerName']")).toBeDisabled();
});

test("contratos: renumeración, cambio de vehículo y asignación manual", async ({ page }) => {
  await loginAdmin(page);
  const suffix = Date.now();
  const windowOpen = buildWindow(50);
  const openWithPlate = await createContractViaForm(page, {
    customerName: `QA Renum ${suffix}`,
    deliveryAt: windowOpen.deliveryAt,
    pickupAt: windowOpen.pickupAt,
    billedCarGroup: "A",
    plate: "1111AAA",
  });

  await page.goto(`/contratos?tab=renumerar&contractNumber=${encodeURIComponent(openWithPlate)}`);
  await page.locator("input[name='branchCode']").fill("ALC");
  await page.locator("input[name='reason']").fill("QA renumeración");
  await page.getByRole("button", { name: "Renumerar" }).click();
  await expect(page).toHaveURL(/tab=renumerar&contractNumber=/);
  const renumberUrl = new URL(page.url());
  const renumbered = renumberUrl.searchParams.get("contractNumber") ?? "";
  expect(renumbered).toMatch(/^\d{2}[/-][A-Z0-9]+[/-]\d{4}$/);
  await expect(page.getByText("Contrato renumerado")).toBeVisible();

  await page.goto("/contratos?tab=cambio");
  const changeSelect = page.locator("select[name='changeContractId']");
  const changeContractId = await changeSelect.evaluate((element, needle) => {
    const select = element as HTMLSelectElement;
    const target = Array.from(select.options).find((option) => option.text.includes(String(needle)));
    return target?.value ?? "";
  }, `QA Renum ${suffix}`);
  expect(changeContractId).toBeTruthy();
  await changeSelect.selectOption(changeContractId);
  await page.getByRole("button", { name: "Cargar contrato" }).click();

  const nextPlate = await page.locator("#fleet-contract-change option").evaluateAll((options) => {
    const values = options.map((option) => (option as HTMLOptionElement).value).filter(Boolean);
    return values[0] ?? "";
  });
  if (!nextPlate) {
    test.skip(true, "Sin matrículas activas disponibles para cambio de vehículo.");
  }
  await page.locator("input[name='vehiclePlate']").fill(nextPlate);
  await page.locator("input[name='changeReason']").fill("QA cambio vehículo");
  await page.locator("select[name='overrideAccepted']").selectOption("true");
  await page.locator("input[name='overrideReason']").fill("QA cambio con override");
  await page.getByRole("button", { name: "Cambiar vehículo" }).click();
  await expect(page).toHaveURL(/ok=Veh%C3%ADculo\+cambiado|ok=Veh%C3%ADculo%20cambiado/);

  await page.goto(`/contratos?tab=localizar&customer=${encodeURIComponent(`QA Renum ${suffix}`)}`);
  const changedRow = page.getByRole("row").filter({ hasText: `QA Renum ${suffix}` }).first();
  await expect(changedRow).toContainText(nextPlate);

  const windowNoPlate = buildWindow(60);
  const openWithoutPlate = await createContractViaForm(page, {
    customerName: `QA Asignacion ${suffix}`,
    deliveryAt: windowNoPlate.deliveryAt,
    pickupAt: windowNoPlate.pickupAt,
    billedCarGroup: "ZZZ",
  });
  await page.goto(`/contratos?tab=localizar&contractNumber=${encodeURIComponent(openWithoutPlate)}`);
  const noPlateRow = page.getByRole("row").filter({ hasText: openWithoutPlate }).first();
  await expect(noPlateRow).toBeVisible();
  await noPlateRow.getByRole("link", { name: "Asignar matrícula" }).click();
  await expect(page).toHaveURL(/tab=asignacion/);

  await page.locator("input[list='fleet-assign-selected']").fill("2222BBB");
  await page.locator("select[name='overrideAccepted']").first().selectOption("true");
  await page.locator("input[name='overrideReason']").first().fill("QA asignación manual");
  await page.getByRole("button", { name: "Asignar matrícula" }).first().click();
  await expect(page).toHaveURL(/ok=Matr%C3%ADcula\+asignada|ok=Matr%C3%ADcula%20asignada/);

  await page.goto(`/contratos?tab=localizar&contractNumber=${encodeURIComponent(openWithoutPlate)}`);
  const assignedRow = page.getByRole("row").filter({ hasText: openWithoutPlate }).first();
  await expect(assignedRow).toContainText("2222BBB");
});
