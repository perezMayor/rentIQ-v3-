import PDFDocument from "pdfkit";

type PdfSection = {
  title: string;
  rows: Array<[string, string]>;
};

export async function buildSimplePdf(input: {
  title: string;
  subtitle: string;
  sections: PdfSection[];
}): Promise<Buffer> {
  // Renderizador PDF mínimo para documentos operativos (facturas/listados).
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cabecera del documento.
    doc.fontSize(18).text(input.title);
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

    doc.end();
  });
}
