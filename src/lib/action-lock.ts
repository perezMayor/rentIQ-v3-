import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getDataDir } from "@/lib/data-dir";
import { isFeatureEnabled } from "@/lib/feature-flags";

const inFlight = new Set<string>();
const LOCK_TTL_MS = 15_000;

function normalizeKey(rawKey: string): string {
  return rawKey.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_");
}

function lockPath(key: string): string {
  const hashed = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(getDataDir(), "action-locks", `${hashed}.lock`);
}

async function ensureLockDir(lockFilePath: string): Promise<void> {
  await mkdir(path.dirname(lockFilePath), { recursive: true });
}

async function acquireFileLock(lockFilePath: string): Promise<void> {
  await ensureLockDir(lockFilePath);
  try {
    const handle = await open(lockFilePath, "wx");
    await handle.close();
    return;
  } catch {
    const lockStats = await stat(lockFilePath).catch(() => null);
    if (lockStats && Date.now() - lockStats.mtimeMs > LOCK_TTL_MS) {
      await rm(lockFilePath, { force: true }).catch(() => {});
      const handle = await open(lockFilePath, "wx");
      await handle.close();
      return;
    }
    throw new Error("Operación en curso. Espera unos segundos y vuelve a intentarlo.");
  }
}

async function releaseFileLock(lockFilePath: string): Promise<void> {
  await rm(lockFilePath, { force: true }).catch(() => {});
}

export async function withActionLock<T>(rawKey: string, work: () => Promise<T>): Promise<T> {
  if (!isFeatureEnabled("ENABLE_STRICT_ACTION_LOCK")) {
    return work();
  }
  const key = normalizeKey(rawKey);
  if (inFlight.has(key)) {
    throw new Error("Operación en curso. Evita doble envío.");
  }
  const file = lockPath(key);
  inFlight.add(key);
  await acquireFileLock(file);
  try {
    return await work();
  } finally {
    inFlight.delete(key);
    await releaseFileLock(file);
  }
}
