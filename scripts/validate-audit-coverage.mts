// Módulo validate-audit-coverage.mts.
import { readAllAuditEvents } from "@/lib/audit";
import { readRentalData } from "@/lib/services/rental-store";

type Finding = {
  code: string;
  message: string;
  entityId?: string;
};

function getBatchId(note: string): string {
  const m = /\[BATCH:([^\]]+)\]/.exec(note ?? "");
  return m?.[1]?.trim() ?? "";
}

async function main() {
  const allowIssues = process.argv.includes("--allow-issues");
  const data = await readRentalData();
  const events = await readAllAuditEvents({ includeSuppressed: true });
  const findings: Finding[] = [];

  const hasEvent = (entity: string, entityId: string) => events.some((event) => event.entity === entity && event.entityId === entityId);

  for (const reservation of data.reservations) {
    if (!hasEvent("reservation", reservation.id)) {
      findings.push({
        code: "RESERVATION_NO_AUDIT",
        entityId: reservation.id,
        message: `Reserva sin evento de auditoría: ${reservation.reservationNumber}`,
      });
    }
  }

  for (const contract of data.contracts) {
    if (!hasEvent("contract", contract.id)) {
      findings.push({
        code: "CONTRACT_NO_AUDIT",
        entityId: contract.id,
        message: `Contrato sin evento de auditoría: ${contract.contractNumber}`,
      });
    }
    if (contract.status === "CERRADO" && !hasEvent("contract_close", contract.id)) {
      findings.push({
        code: "CONTRACT_CLOSED_NO_AUDIT",
        entityId: contract.id,
        message: `Contrato cerrado sin evento contract_close: ${contract.contractNumber}`,
      });
    }
  }

  for (const invoice of data.invoices) {
    if (!hasEvent("invoice", invoice.id)) {
      findings.push({
        code: "INVOICE_NO_AUDIT",
        entityId: invoice.id,
        message: `Factura sin evento de auditoría: ${invoice.invoiceNumber}`,
      });
    }
  }

  for (const expense of data.internalExpenses) {
    if (expense.contractId === "__DIARIO__") {
      const batchId = getBatchId(expense.note);
      if (!batchId) {
        findings.push({
          code: "DAILY_EXPENSE_WITHOUT_BATCH",
          entityId: expense.id,
          message: `Gasto diario sin batch: ${expense.id}`,
        });
        continue;
      }
      if (!hasEvent("daily_operational_expense", batchId)) {
        findings.push({
          code: "DAILY_EXPENSE_BATCH_NO_AUDIT",
          entityId: batchId,
          message: `Batch diario sin auditoría: ${batchId}`,
        });
      }
      continue;
    }
    if (!hasEvent("internal_expense", expense.id)) {
      findings.push({
        code: "CONTRACT_EXPENSE_NO_AUDIT",
        entityId: expense.id,
        message: `Gasto de contrato sin auditoría: ${expense.id}`,
      });
    }
  }

  const byCode = findings.reduce<Record<string, number>>((acc, item) => {
    acc[item.code] = (acc[item.code] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Cobertura auditoría: ${findings.length === 0 ? "OK" : "CON INCIDENCIAS"}`);
  console.log(`Total incidencias: ${findings.length}`);
  for (const [code, total] of Object.entries(byCode).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`- ${code}: ${total}`);
  }
  for (const item of findings) {
    console.log(`[${item.code}] ${item.message}`);
  }

  if (findings.length > 0 && !allowIssues) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
