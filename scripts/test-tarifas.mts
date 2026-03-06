import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-tarifas-test-"));

const {
  calculateTariffQuote,
  createTariffPlan,
  listTariffPlans,
  upsertTariffBracket,
  upsertTariffPrice,
} = await import("@/lib/services/rental-service");

const ACTOR = { id: "u-admin", role: "ADMIN" as const };

async function createSeasonPlan(input: {
  code: string;
  title: string;
  season: string;
  validFrom: string;
  validTo: string;
  groupCode: string;
  price3: number;
  price7: number;
}) {
  await createTariffPlan(
    {
      code: input.code,
      title: input.title,
      season: input.season,
      validFrom: input.validFrom,
      validTo: input.validTo,
      active: "true",
    },
    ACTOR,
  );

  const plan = (await listTariffPlans(input.code)).find(
    (item) =>
      item.code === input.code &&
      item.season === input.season &&
      item.validFrom === input.validFrom &&
      item.validTo === input.validTo,
  );
  assert.ok(plan?.id, `Plan no encontrado: ${input.title}`);

  await upsertTariffBracket(
    { tariffPlanId: plan.id, label: "3d", fromDay: "1", toDay: "3", order: "1" },
    ACTOR,
  );
  await upsertTariffBracket(
    { tariffPlanId: plan.id, label: "7d", fromDay: "7", toDay: "7", order: "2" },
    ACTOR,
  );

  const refreshed = (await listTariffPlans(input.code)).find((item) => item.id === plan.id);
  assert.ok(refreshed?.id);

  const { listTariffCatalog } = await import("@/lib/services/rental-service");
  const catalog = await listTariffCatalog(plan.id);
  const bracket3 = catalog.brackets.find((item) => item.label === "3d");
  const bracket7 = catalog.brackets.find((item) => item.label === "7d");
  assert.ok(bracket3?.id, "Falta tramo 3d");
  assert.ok(bracket7?.id, "Falta tramo 7d");

  await upsertTariffPrice(
    {
      tariffPlanId: plan.id,
      bracketId: bracket3.id,
      groupCode: input.groupCode,
      price: String(input.price3),
    },
    ACTOR,
  );
  await upsertTariffPrice(
    {
      tariffPlanId: plan.id,
      bracketId: bracket7.id,
      groupCode: input.groupCode,
      price: String(input.price7),
    },
    ACTOR,
  );

  return plan.id;
}

async function main() {
  const tmpDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    const mediaPlanId = await createSeasonPlan({
      code: "TXT",
      title: "Tarifa prueba media",
      season: "MEDIA",
      validFrom: "2026-06-01",
      validTo: "2026-06-11",
      groupCode: "A",
      price3: 90,
      price7: 175,
    });
    await createSeasonPlan({
      code: "TXT",
      title: "Tarifa prueba alta",
      season: "ALTA",
      validFrom: "2026-06-12",
      validTo: "2026-08-31",
      groupCode: "A",
      price3: 120,
      price7: 280,
    });

    // 5 días sin tramo definido => prorrateo del inmediatamente inferior (3 días).
    const fiveDays = await calculateTariffQuote({
      tariffPlanId: mediaPlanId,
      groupCode: "A",
      billedDays: 5,
      deliveryAt: "2026-06-03T09:00:00",
      pickupAt: "2026-06-08T09:00:00",
    });
    assert.equal(fiveDays.found, true);
    assert.equal(Number(fiveDays.amount.toFixed(2)), 150);

    // Cruce temporadas >= 7 días => ambos segmentos prorrateados sobre 7 días.
    // Del 10 al 20: 2 días en media (10-11) + 8 en alta (12-19).
    const tenDaysCross = await calculateTariffQuote({
      tariffPlanId: mediaPlanId,
      groupCode: "A",
      billedDays: 10,
      deliveryAt: "2026-06-10T09:00:00",
      pickupAt: "2026-06-20T09:00:00",
    });
    assert.equal(tenDaysCross.found, true);
    assert.equal(Number(tenDaysCross.amount.toFixed(2)), 370);

    // Cruce temporadas < 7 días => ambos segmentos prorrateados sobre 3 días.
    const sixDaysCross = await calculateTariffQuote({
      tariffPlanId: mediaPlanId,
      groupCode: "A",
      billedDays: 6,
      deliveryAt: "2026-06-10T09:00:00",
      pickupAt: "2026-06-16T09:00:00",
    });
    assert.equal(sixDaysCross.found, true);
    assert.equal(Number(sixDaysCross.amount.toFixed(2)), 220);

    // 8 días sin tramo exacto => prorrateo sobre tramo 7 días.
    const eightDays = await calculateTariffQuote({
      tariffPlanId: mediaPlanId,
      groupCode: "A",
      billedDays: 8,
      deliveryAt: "2026-06-12T09:00:00",
      pickupAt: "2026-06-20T09:00:00",
    });
    assert.equal(eightDays.found, true);
    assert.equal(Number(eightDays.amount.toFixed(2)), 320);

    console.log("OK test-tarifas");
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}

await main();

