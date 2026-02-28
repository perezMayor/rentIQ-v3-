import { validateDataIntegrity } from "@/lib/services/rental-service";

async function main() {
  const allowIssues = process.argv.includes("--allow-issues");
  const result = await validateDataIntegrity();

  console.log(`Integridad @ ${result.checkedAt}`);
  console.log(`Estado: ${result.ok ? "OK" : "CON INCIDENCIAS"}`);
  console.log(`Total incidencias: ${result.totalIssues}`);
  const codes = Object.entries(result.byCode).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [code, total] of codes) {
    console.log(`- ${code}: ${total}`);
  }

  if (!result.ok) {
    console.log("Detalle:");
    for (const issue of result.issues) {
      console.log(
        `[${issue.code}] entity=${issue.entity} entityId=${issue.entityId} reference=${issue.reference} :: ${issue.message}`,
      );
    }
  }

  if (!result.ok && !allowIssues) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
