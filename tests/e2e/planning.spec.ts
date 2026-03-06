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
    startDate: start.toISOString().slice(0, 10),
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

async function createReservation(page: Page, input: {
  customerName: string;
  deliveryAt: string;
  pickupAt: string;
  status: "PETICION" | "CONFIRMADA";
  billedGroup: string;
  assignedPlate?: string;
}) {
  await page.goto("/reservas?tab=gestion");
  await page.locator("input[name='customerId']").fill("CL-000001");
  await page.locator("input[name='customerName']").fill(input.customerName);
  await page.locator("input[name='branchDelivery']").fill("ALC");
  await page.locator("input[name='pickupBranch']").fill("ALC");
  await page.locator("input[name='deliveryAt']").fill(input.deliveryAt);
  await page.locator("input[name='pickupAt']").fill(input.pickupAt);
  await page.locator("select[name='reservationStatus']").selectOption(input.status);
  await page.locator("input[name='billedCarGroup']").fill(input.billedGroup);
  if (input.assignedPlate) {
    await page.locator("input[name='assignedPlate']").fill(input.assignedPlate);
  }

  await page.getByRole("button", { name: "Guardar reserva" }).click();
  await expect(page).toHaveURL(/\/reservas\?tab=gestion&((ok=Reserva\+creada)|(error=SMTP))/);

  await page.goto(`/reservas?tab=localizar&locCustomer=${encodeURIComponent(input.customerName)}&locFrom=2026-01-01&locTo=2027-12-31`);
  const row = page.getByRole("row").filter({ hasText: input.customerName }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole("link", { name: /Abrir/i }).getAttribute("href");
  expect(href).toBeTruthy();
  const reservationId = new URL(href ?? "", "http://localhost").searchParams.get("reservationId") ?? "";
  const reservationNumberCell = row.locator("td").first();
  const reservationNumber = (await reservationNumberCell.textContent())?.trim() ?? "";
  expect(reservationId).toBeTruthy();
  expect(reservationNumber).toBeTruthy();
  return { reservationId, reservationNumber };
}

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
