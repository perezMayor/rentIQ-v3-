// Módulo test-backup.mts.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-backup-test-"));

const { getDataDir } = await import("@/lib/data-dir");
const { readRentalData, writeRentalData } = await import("@/lib/services/rental-store");
const { createFullBackup, listBackups, restoreBackup } = await import("@/lib/services/backup-service");

async function seedBaseFiles() {
  const data = await readRentalData();
  data.companySettings.companyName = "RentIQ Test";
  data.companySettings.providers = ["PROVEEDOR UNO", "PROVEEDOR DOS"];
  data.vehicleExtras = [
    {
      id: "extra-gps",
      code: "GPS",
      name: "GPS",
      priceMode: "POR_DIA",
      unitPrice: 6,
      maxDays: 7,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  data.fleetVehicles = [
    {
      id: "veh-1",
      plate: "1111AAA",
      modelId: "model-x",
      categoryId: "cat-x",
      owner: "PROVEEDOR UNO",
      color: "",
      year: 2024,
      vin: "",
      odometerKm: 0,
      fuelType: "GASOLINA",
      activeFrom: "2026-01-01",
      activeUntil: "2026-12-31",
      acquisitionCost: 10000,
      alertNotes: "nota",
      deactivatedAt: "",
      deactivationReason: "",
      deactivationAmount: 0,
      createdAt: new Date().toISOString(),
      createdBy: "seed",
    },
  ];
  await writeRentalData(data);

  const dataDir = getDataDir();
  await mkdir(path.join(dataDir, "attachments"), { recursive: true });
  await mkdir(path.join(dataDir, "templates"), { recursive: true });
  await writeFile(path.join(dataDir, "attachments", "a.txt"), "A1", "utf8");
  await writeFile(path.join(dataDir, "templates", "tpl.html"), "<h1>Plantilla</h1>", "utf8");
}

async function testBackupRestoreIntegrityAndSafety() {
  const actor = { id: "u-super-admin", role: "SUPER_ADMIN" as const };
  const first = await createFullBackup("FORCED", actor);
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.checksum);
  assert.ok(first.files.length > 0);

  const dataDir = getDataDir();
  await writeFile(path.join(dataDir, "attachments", "a.txt"), "A2-mutado", "utf8");
  const mutated = await readRentalData();
  mutated.companySettings.providers = ["MUTADO"];
  mutated.vehicleExtras = [];
  mutated.fleetVehicles = [];
  await writeRentalData(mutated);
  await restoreBackup(first.backupId, actor);

  const restored = await readFile(path.join(dataDir, "attachments", "a.txt"), "utf8");
  assert.equal(restored, "A1");
  const restoredStore = await readRentalData();
  assert.deepEqual(restoredStore.companySettings.providers, ["PROVEEDOR UNO", "PROVEEDOR DOS"]);
  assert.equal(restoredStore.vehicleExtras.length, 1);
  assert.equal(restoredStore.fleetVehicles.length, 1);
  assert.equal(restoredStore.fleetVehicles[0]?.owner, "PROVEEDOR UNO");

  const backups = await listBackups();
  const hasSafetySnapshot = backups.some((item) => item.reason === "SAFETY_SNAPSHOT" && item.status === "SUCCESS");
  assert.equal(hasSafetySnapshot, true);
}

async function testBackupLock() {
  const actor = { id: "u-super-admin", role: "SUPER_ADMIN" as const };
  const p1 = createFullBackup("FORCED", actor);
  const p2 = createFullBackup("FORCED", actor);
  const [r1, r2] = await Promise.allSettled([p1, p2]);
  const failures = [r1, r2].filter((item) => item.status === "rejected");
  assert.ok(failures.length >= 1);
  const lockError = failures.some((item) =>
    item.status === "rejected" ? String(item.reason).toLowerCase().includes("en curso") : false,
  );
  assert.equal(lockError, true);
}

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    await seedBaseFiles();
    await testBackupRestoreIntegrityAndSafety();
    await testBackupLock();
    console.log("OK test:backup");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
