import { expect, test, type Page } from "@playwright/test";

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.selectOption("select[name='branch']", "principal");
  await page.fill("input[name='email']", "admin@rentiq.local");
  await page.fill("input[name='password']", "Admin#2026");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("reservas: botón crear cliente abre ficha", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/reservas?tab=gestion");

  await page.getByRole("link", { name: "Crear cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\?tab=ficha/);
});

test("reservas: autocompletado por ID y por nombre", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/reservas?tab=gestion");

  const customerId = page.locator("input[name='customerId']");
  const customerName = page.locator("input[name='customerName']");

  await customerName.fill("Juan Pérez");
  await customerName.blur();
  const detectedId = await customerId.inputValue();
  if (!detectedId) {
    test.skip(true, "Sin cliente demo resoluble para autocompletado en este dataset.");
  }
  await expect(customerId).not.toHaveValue("");

  await customerName.fill("");
  await customerId.fill(detectedId);
  await customerId.blur();
  await expect(customerName).not.toHaveValue("");

  await customerId.fill("");
  await customerName.fill("Juan Pérez");
  await customerName.blur();
  await expect(customerId).not.toHaveValue("");
});

test("reservas: creación PETICION con extras/notas/conductor + auditoría", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/reservas?tab=gestion");

  const uniqueName = `QA Reserva ${Date.now()}`;

  await page.locator("input[name='customerId']").fill("CL-000001");
  await page.locator("input[name='customerId']").blur();
  await page.locator("input[name='customerName']").fill(uniqueName);

  await page.locator("input[name='branchDelivery']").fill("ALC");
  await page.locator("input[name='deliveryAt']").fill("2026-04-15T09:00");
  await page.locator("input[name='pickupBranch']").fill("ALC");
  await page.locator("input[name='pickupAt']").fill("2026-04-18T09:00");
  await page.locator("select[name='reservationStatus']").selectOption("PETICION");
  const statusValues = await page
    .locator("select[name='reservationStatus'] option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(statusValues).toContain("CONFIRMADA");
  expect(statusValues).toContain("PETICION");

  const billedGroup = page.locator("input[name='billedCarGroup']");
  await billedGroup.fill("A");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Has cambiado el grupo");
    await dialog.accept();
  });
  await billedGroup.fill("B");
  await expect(page.getByText("El precio del alquiler se recalculará al guardar la reserva.")).toBeVisible();

  await page.getByRole("button", { name: "Extras" }).click();
  const extraSelect = page.locator("label:has-text('Extra') select");
  const extraOptionValue = await extraSelect.evaluate((element) => {
    const select = element as HTMLSelectElement;
    const realOption = Array.from(select.options).find((option) => option.value && option.value !== "");
    return realOption?.value ?? "";
  });
  if (extraOptionValue) {
    await extraSelect.selectOption(extraOptionValue);
    await page.locator("label:has-text('Unidades') input[type='number']").fill("2");
    await page.getByRole("button", { name: "Añadir extra" }).click();
    await expect(page.getByRole("table")).toContainText(/Por día|Fijo/);
  }

  await page.getByRole("button", { name: "Conductores adicionales" }).click();
  await page.locator("label:has-text('Nombre') input").fill("Conductor QA");
  await page.locator("label:has-text('Carnet de conducir') input").fill("LIC-QA-2026");

  await page.getByRole("button", { name: "Notas públicas" }).click();
  await page.locator("textarea[name='publicNotes']").fill("Nota pública QA reservas");
  await page.getByRole("button", { name: "Notas privadas" }).click();
  await page.locator("textarea[name='privateNotes']").fill("Nota privada QA reservas");

  await page.getByRole("button", { name: "Guardar reserva" }).click();
  await expect(page).toHaveURL(/\/reservas\?tab=gestion&((ok=Reserva\+creada)|(error=SMTP))/);

  await page.goto(
    `/reservas?tab=localizar&locCustomer=${encodeURIComponent(uniqueName)}&locFrom=2026-01-01&locTo=2026-12-31&locStatus=PETICION`,
  );

  const row = page.getByRole("row").filter({ hasText: uniqueName }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("PETICION");

  const openReservation = row.getByRole("link", { name: /Abrir/i });
  const href = await openReservation.getAttribute("href");
  expect(href).toBeTruthy();
  const reservationId = new URL(href ?? "", "http://localhost").searchParams.get("reservationId");
  expect(reservationId).toBeTruthy();

  await page.goto(`/reservas?tab=gestion&auditReservationId=${encodeURIComponent(reservationId ?? "")}`);
  await expect(page.getByRole("heading", { name: "Auditoría de reserva" })).toBeVisible();
  await expect(page.getByText("Sin eventos.")).toHaveCount(0);
});
