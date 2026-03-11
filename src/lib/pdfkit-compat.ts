// Utilidad compartida del dominio RentIQ (pdfkit-compat).
import fs from "node:fs";
import path from "node:path";
import type PDFDocument from "pdfkit";
import fontkit from "fontkit";

let patched = false;

function resolvePdfkitDataDir(): string | null {
  const cwdCandidate = path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  try {
    const pdfkitMain = require.resolve("pdfkit");
    const moduleCandidate = path.join(path.dirname(pdfkitMain), "data");
    if (fs.existsSync(moduleCandidate)) return moduleCandidate;
  } catch {
    // Ignora resolución de módulo si el runtime no lo permite.
  }
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
      const baseName = path.basename(file);
      if (baseName.toLowerCase().endsWith(".afm")) {
        const mapped = path.join(targetDataDir, baseName);
        if (fs.existsSync(mapped)) {
          return originalReadFileSync(mapped, ...args);
        }
      }
    }
    return originalReadFileSync(file as Parameters<typeof fs.readFileSync>[0], ...args);
  }) as typeof fs.readFileSync;

  fs.readFileSync = patchedReadFileSync;
  patched = true;
}

function collectFontFiles(rootDir: string, acc: string[]): void {
  if (!fs.existsSync(rootDir)) return;
  for (const name of fs.readdirSync(rootDir)) {
    const fullPath = path.join(rootDir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      collectFontFiles(fullPath, acc);
      continue;
    }
    if (/\.(ttf|otf|woff2?)$/i.test(name)) {
      acc.push(fullPath);
    }
  }
}

function resolvePoppinsFonts(): { regular: string; bold: string } | null {
  const candidates: string[] = [];
  collectFontFiles(path.join(process.cwd(), ".next"), candidates);
  for (const file of candidates) {
    try {
      const font = fontkit.openSync(file);
      if (font.familyName !== "Poppins") continue;
      const subfamily = (font.subfamilyName || "").toLowerCase();
      const key =
        subfamily.includes("bold") ? "bold" :
        subfamily.includes("regular") ? "regular" :
        subfamily.includes("medium") ? "regular" :
        subfamily.includes("semibold") ? "bold" :
        null;
      if (!key) continue;
      const current = (resolvePoppinsFonts as unknown as { cache?: { regular?: string; bold?: string } }).cache ?? {};
      current[key] = current[key] || file;
      (resolvePoppinsFonts as unknown as { cache?: { regular?: string; bold?: string } }).cache = current;
      if (current.regular && current.bold) {
        return { regular: current.regular, bold: current.bold };
      }
    } catch {
      // Ignora archivos incompatibles.
    }
  }
  const cached = (resolvePoppinsFonts as unknown as { cache?: { regular?: string; bold?: string } }).cache;
  if (cached?.regular) {
    return { regular: cached.regular, bold: cached.bold ?? cached.regular };
  }
  return null;
}

function resolvePdfkitFallbackFonts(): { regular: string; bold: string } | null {
  const poppins = resolvePoppinsFonts();
  if (poppins) return poppins;

  const macRegular = "/System/Library/Fonts/Supplemental/Arial.ttf";
  const macBold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
  if (fs.existsSync(macRegular)) {
    return { regular: macRegular, bold: fs.existsSync(macBold) ? macBold : macRegular };
  }

  const bundledRegular = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "noto-sans-v27-latin-regular.ttf",
  );
  if (fs.existsSync(bundledRegular)) {
    return { regular: bundledRegular, bold: bundledRegular };
  }

  return null;
}

export function applyPdfkitFontFallback(doc: PDFDocument): void {
  const fonts = resolvePdfkitFallbackFonts();
  if (!fonts) return;

  const originalFont = doc.font.bind(doc);
  type FontSource = Parameters<typeof doc.font>[0];
  type FontRest = Parameters<typeof doc.font> extends [FontSource, ...infer Rest] ? Rest : never;
  const mappedFonts: Record<string, string> = {
    Helvetica: fonts.regular,
    "Helvetica-Bold": fonts.bold,
    "Helvetica-Oblique": fonts.regular,
    "Helvetica-BoldOblique": fonts.bold,
    "Times-Roman": fonts.regular,
    "Times-Bold": fonts.bold,
    "Times-Italic": fonts.regular,
    "Times-BoldItalic": fonts.bold,
    Courier: fonts.regular,
    "Courier-Bold": fonts.bold,
    "Courier-Oblique": fonts.regular,
    "Courier-BoldOblique": fonts.bold,
  };

  doc.font = ((src: FontSource, ...args: FontRest) => {
    if (typeof src === "string") {
      const mapped = mappedFonts[src];
      if (mapped) {
        return originalFont(mapped, ...args);
      }
    }
    return originalFont(src, ...args);
  }) as typeof doc.font;

  originalFont(fonts.regular);
}
