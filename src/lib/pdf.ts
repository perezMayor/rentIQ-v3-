import PDFDocument from "pdfkit";
import { applyPdfkitFontFallback, ensurePdfkitFontCompat } from "@/lib/pdfkit-compat";

type PdfSection = {
  title: string;
  rows: Array<[string, string]>;
};

export async function buildSimplePdf(input: {
  title: string;
  subtitle: string;
  sections: PdfSection[];
  companyName?: string;
  companyTaxId?: string;
  companyAddress?: string;
  companyFooter?: string;
  logoDataUrl?: string;
  accentColor?: string;
}): Promise<Buffer> {
  // Renderizador PDF mínimo para documentos operativos (facturas/listados).
  return new Promise((resolve, reject) => {
    ensurePdfkitFontCompat();
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    applyPdfkitFontFallback(doc);
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = input.accentColor && /^#[0-9a-fA-F]{6}$/.test(input.accentColor) ? input.accentColor : "#2563eb";
    let y = 40;
    const logoMatch = (input.logoDataUrl ?? "").match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
    if (logoMatch?.[1]) {
      try {
        const logoBuffer = Buffer.from(logoMatch[1], "base64");
        if (logoBuffer.length > 0) {
          doc.image(logoBuffer, 40, y, { fit: [78, 46] });
        }
      } catch {
        // Ignora logo inválido sin bloquear emisión de PDF.
      }
    }

    const headerX = logoMatch?.[1] ? 130 : 40;
    const companyLine = input.companyName?.trim() || "";
    if (companyLine) {
      doc.fontSize(13).fillColor("#111827").text(companyLine, headerX, y + 2, { width: 420 });
      y += 18;
    }
    const legalLine = [input.companyTaxId?.trim(), input.companyAddress?.trim()].filter(Boolean).join(" · ");
    if (legalLine) {
      doc.fontSize(9).fillColor("#4b5563").text(legalLine, headerX, y + 2, { width: 420 });
    }

    // Cabecera del documento.
    doc.moveTo(40, 92).lineTo(555, 92).lineWidth(1.5).strokeColor(accent).stroke();
    doc.fillColor("#111827");
    doc.fontSize(18).text(input.title, 40, 102);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#555").text(input.subtitle);
    doc.fillColor("#000");

    // Bloques de contenido en formato etiqueta:valor.
    for (const section of input.sections) {
      doc.moveDown(1);
      doc.fontSize(13).text(section.title);
      doc.moveDown(0.4);
      doc.fontSize(10);
      for (const [label, value] of section.rows) {
        doc.text(`${label}: ${value ?? ""}`);
      }
    }

    const footer = (input.companyFooter ?? "").trim();
    if (footer) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#6b7280").text(footer, 40, doc.page.height - 52, { width: 515, align: "left" });
      doc.fillColor("#000");
    }

    doc.end();
  });
}
