import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { appendAuditEvent } from "@/lib/audit";
import { getDataDir } from "@/lib/data-dir";
import type { RoleName } from "@/lib/domain/rental";
import { readRentalData } from "@/lib/services/rental-store";

type Actor = { id: string; role: RoleName };

type BackupManifest = {
  backupId: string;
  createdAt: string;
  reason: "SCHEDULED" | "FORCED" | "SAFETY_SNAPSHOT";
  status: "SUCCESS" | "FAILED";
  durationMs: number;
  totalSizeBytes: number;
  checksum: string;
  files: Array<{ relativePath: string; sizeBytes: number; checksum: string }>;
  failureReason: string;
};

function getBackupRoot() {
  return path.join(getDataDir(), "backups");
}

function getBackupLockPath() {
  return path.join(getBackupRoot(), ".backup.lock");
}

// Días de retención parametrizables, con fallback seguro a 90.
async function getRetentionDays() {
  const store = await readRentalData();
  const configured = Number(store.companySettings.backupRetentionDays ?? 90);
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.floor(configured);
  }
  const parsed = Number(process.env.BACKUP_RETENTION_DAYS ?? "90");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 90;
  }
  return Math.floor(parsed);
}

// Conjunto explícito de fuentes incluidas en backup completo.
function getBackupSources() {
  const base = getDataDir();
  return [
    { label: "BD", path: path.join(base, "rental-store.json") },
    { label: "logs", path: path.join(base, "audit-log.jsonl") },
    { label: "adjuntos", path: path.join(base, "attachments") },
    { label: "plantillas", path: path.join(base, "templates") },
    { label: "pdfs", path: path.join(base, "pdfs") },
    { label: "config", path: path.join(base, "config") },
  ];
}

async function hashFile(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function acquireBackupLock() {
  const lockPath = getBackupLockPath();
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await writeFile(lockPath, `${new Date().toISOString()}\n`, { encoding: "utf8", flag: "wx" });
  } catch {
    throw new Error("Ya hay una operación de backup/restore en curso");
  }
  return lockPath;
}

async function releaseBackupLock(lockPath: string) {
  await rm(lockPath, { force: true });
}

async function collectDirectoryFiles(
  basePath: string,
  baseLabel: string,
): Promise<Array<{ relativePath: string; sizeBytes: number; checksum: string }>> {
  const entries = await readdir(basePath, { withFileTypes: true });
  const files: Array<{ relativePath: string; sizeBytes: number; checksum: string }> = [];
  for (const entry of entries) {
    const currentPath = path.join(basePath, entry.name);
    const relativePath = path.posix.join(baseLabel, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectDirectoryFiles(currentPath, relativePath);
      files.push(...nested);
      continue;
    }
    const stats = await stat(currentPath);
    const checksum = await hashFile(currentPath);
    files.push({
      relativePath,
      sizeBytes: stats.size,
      checksum,
    });
  }
  return files;
}

function buildManifestChecksum(files: Array<{ relativePath: string; sizeBytes: number; checksum: string }>): string {
  const payload = files
    .toSorted((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((file) => `${file.relativePath}:${file.checksum}:${file.sizeBytes}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

async function assertBackupIntegrity(backupDir: string, manifest: BackupManifest): Promise<void> {
  const errors: string[] = [];
  for (const file of manifest.files) {
    const absolutePath = path.join(backupDir, file.relativePath);
    if (!(await pathExists(absolutePath))) {
      errors.push(`Falta archivo ${file.relativePath}`);
      continue;
    }
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      errors.push(`No es fichero ${file.relativePath}`);
      continue;
    }
    if (stats.size !== file.sizeBytes) {
      errors.push(`Tamaño inválido ${file.relativePath}`);
    }
    const checksum = await hashFile(absolutePath);
    if (checksum !== file.checksum) {
      errors.push(`Checksum inválido ${file.relativePath}`);
    }
  }
  const checksum = buildManifestChecksum(manifest.files);
  if (checksum !== manifest.checksum) {
    errors.push("Checksum global de manifest inválido");
  }
  if (errors.length > 0) {
    throw new Error(`Backup corrupto: ${errors.join(" | ")}`);
  }
}

// Limpia backups vencidos leyendo `createdAt` desde cada manifest.
async function applyRetentionPolicy(): Promise<void> {
  const root = getBackupRoot();
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const keepDays = await getRetentionDays();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

  for (const backupId of backups) {
    const manifestPath = path.join(root, backupId, "manifest.json");
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    const manifestRaw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as { createdAt?: string };
    const createdAt = new Date(manifest.createdAt ?? "");
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }
    if (createdAt.getTime() < cutoff) {
      await rm(path.join(root, backupId), { recursive: true, force: true });
    }
  }
}

async function createFullBackupUnlocked(reason: BackupManifest["reason"], actor: Actor): Promise<BackupManifest> {
  const startedAt = Date.now();
  const createdAt = new Date().toISOString();
  const backupId = `bkp-${createdAt.replace(/[:.]/g, "-")}`;
  const backupDir = path.join(getBackupRoot(), backupId);
  await mkdir(backupDir, { recursive: true });

  const files: BackupManifest["files"] = [];
  let totalSizeBytes = 0;

  try {
    // Copia de fuentes y cálculo de checksums para integridad.
    const sources = getBackupSources();
    for (const source of sources) {
      const exists = await pathExists(source.path);
      if (!exists) {
        continue;
      }

      const targetPath = path.join(backupDir, source.label);
      await cp(source.path, targetPath, { recursive: true });

      const stats = await stat(targetPath);
      if (stats.isFile()) {
        const checksum = await hashFile(targetPath);
        files.push({ relativePath: source.label, sizeBytes: stats.size, checksum });
        totalSizeBytes += stats.size;
      } else {
        const folderFiles = await collectDirectoryFiles(targetPath, source.label);
        files.push(...folderFiles);
        totalSizeBytes += folderFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
      }
    }

    const checksum = buildManifestChecksum(files);

    const manifest: BackupManifest = {
      backupId,
      createdAt,
      reason,
      status: "SUCCESS",
      durationMs: Date.now() - startedAt,
      totalSizeBytes,
      checksum,
      files,
      failureReason: "",
    };

    await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // Auditoría operativa del resultado exitoso.
    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "backup",
      entityId: backupId,
      details: { reason, status: "SUCCESS", checksum, totalSizeBytes, durationMs: manifest.durationMs },
    });

    await applyRetentionPolicy();

    return manifest;
  } catch (error) {
    // También persistimos manifest en error para diagnóstico post-mortem.
    const manifest: BackupManifest = {
      backupId,
      createdAt,
      reason,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      totalSizeBytes,
      checksum: "",
      files,
      failureReason: error instanceof Error ? error.message : "Backup failed",
    };

    await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    await appendAuditEvent({
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: actor.id,
      actorRole: actor.role,
      entity: "backup",
      entityId: backupId,
      details: { reason, status: "FAILED", failureReason: manifest.failureReason },
    });

    return manifest;
  }
}

export async function createFullBackup(reason: BackupManifest["reason"], actor: Actor): Promise<BackupManifest> {
  const lockPath = await acquireBackupLock();
  try {
    return await createFullBackupUnlocked(reason, actor);
  } finally {
    await releaseBackupLock(lockPath);
  }
}

export async function listBackups(): Promise<BackupManifest[]> {
  const root = getBackupRoot();
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const manifests: BackupManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(root, entry.name, "manifest.json");
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    const raw = await readFile(manifestPath, "utf8");
    manifests.push(JSON.parse(raw) as BackupManifest);
  }

  return manifests.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreBackup(backupId: string, actor: Actor): Promise<void> {
  const lockPath = await acquireBackupLock();
  try {
  const root = getBackupRoot();
  const target = path.join(root, backupId);
  if (!(await pathExists(target))) {
    throw new Error("Backup no encontrado");
  }
  const manifestPath = path.join(target, "manifest.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error("Manifest de backup no encontrado");
  }
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as BackupManifest;
  await assertBackupIntegrity(target, manifest);

  // Protección: snapshot previo para poder volver atrás si la restauración falla después.
  const safety = await createFullBackupUnlocked("SAFETY_SNAPSHOT", actor);
  if (safety.status !== "SUCCESS") {
    throw new Error("No se pudo crear safety snapshot antes de restaurar");
  }

  const dataDir = getDataDir();
  const restoreMap = [
    { source: path.join(target, "BD"), destination: path.join(dataDir, "rental-store.json") },
    { source: path.join(target, "logs"), destination: path.join(dataDir, "audit-log.jsonl") },
    { source: path.join(target, "adjuntos"), destination: path.join(dataDir, "attachments") },
    { source: path.join(target, "plantillas"), destination: path.join(dataDir, "templates") },
    { source: path.join(target, "pdfs"), destination: path.join(dataDir, "pdfs") },
    { source: path.join(target, "config"), destination: path.join(dataDir, "config") },
  ];

  // Restaura únicamente rutas existentes en el backup seleccionado.
  for (const item of restoreMap) {
    if (!(await pathExists(item.source))) {
      continue;
    }
    await cp(item.source, item.destination, { recursive: true, force: true });
  }

  await appendAuditEvent({
    timestamp: new Date().toISOString(),
    action: "SYSTEM",
    actorId: actor.id,
    actorRole: actor.role,
    entity: "restore",
    entityId: backupId,
    details: { safetySnapshotId: safety.backupId, status: "SUCCESS", verifiedChecksum: manifest.checksum },
  });
  } finally {
    await releaseBackupLock(lockPath);
  }
}
