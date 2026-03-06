// Utilidad compartida del dominio RentIQ (pdfkit-compat).
import fs from "node:fs";
import path from "node:path";

let patched = false;

function resolvePdfkitDataDir(): string | null {
  const cwdCandidate = path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  return null;
}

export function ensurePdfkitFontCompat(): void {
  if (patched) return;
  const targetDataDir = resolvePdfkitDataDir();
  if (!targetDataDir) return;

  const legacyPrefixes = [
    "/ROOT/node_modules/pdfkit/js/data/",
    "/root/node_modules/pdfkit/js/data/",
  ];

  const originalReadFileSync = fs.readFileSync.bind(fs);
  const patchedReadFileSync: typeof fs.readFileSync = ((file, ...args) => {
    if (typeof file === "string") {
      const prefix = legacyPrefixes.find((item) => file.startsWith(item));
      if (prefix) {
        const mapped = path.join(targetDataDir, file.slice(prefix.length));
        return originalReadFileSync(mapped, ...args);
      }
    }
    return originalReadFileSync(file as Parameters<typeof fs.readFileSync>[0], ...args);
  }) as typeof fs.readFileSync;

  fs.readFileSync = patchedReadFileSync;
  patched = true;
}

