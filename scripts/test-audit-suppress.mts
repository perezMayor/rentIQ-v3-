// Módulo test-audit-suppress.mts.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

process.env.RENTIQ_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "rentiq-audit-suppress-"));

const { appendAuditEvent, readAllAuditEvents, readLatestAuditEvents, suppressAuditEvent } = await import("@/lib/audit");

async function main() {
  const tempDataDir = process.env.RENTIQ_DATA_DIR || "";
  try {
    await appendAuditEvent({
      id: "evt-1",
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: "u-admin",
      actorRole: "ADMIN",
      entity: "test_entity",
      entityId: "1",
      details: {},
    });
    await appendAuditEvent({
      id: "evt-2",
      timestamp: new Date().toISOString(),
      action: "SYSTEM",
      actorId: "u-admin",
      actorRole: "ADMIN",
      entity: "test_entity",
      entityId: "2",
      details: {},
    });

    let visible = await readLatestAuditEvents(20);
    assert.equal(visible.some((item) => item.id === "evt-1"), true);

    await suppressAuditEvent({
      targetEventId: "evt-1",
      actorId: "u-super-admin",
      actorRole: "SUPER_ADMIN",
      reason: "test",
    });

    visible = await readLatestAuditEvents(20);
    assert.equal(visible.some((item) => item.id === "evt-1"), false);
    assert.equal(visible.some((item) => item.id === "evt-2"), true);

    const raw = await readAllAuditEvents({ includeSuppressed: true });
    assert.equal(raw.some((item) => item.id === "evt-1"), true);
    assert.equal(raw.some((item) => item.action === "AUDIT_SUPPRESS"), true);

    console.log("OK test:audit-suppress");
  } finally {
    if (tempDataDir) {
      await rm(tempDataDir, { recursive: true, force: true });
    }
  }
}

await main();
