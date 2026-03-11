import PDFDocument from "pdfkit";
import { applyPdfkitFontFallback, ensurePdfkitFontCompat } from "@/lib/pdfkit-compat";
import type { DeliveryPickupListRow } from "@/lib/services/rental-service";

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function drawEntry(
  doc: PDFKit.PDFDocument,
  row: DeliveryPickupListRow,
  y: number,
  accentColor: string,
): number {
  const margin = 34;
  const width = doc.page.width - margin * 2;
  const notes = (row.privateNotes || "").trim();
  const boxPadding = 10;
  const contentWidth = width - boxPadding * 2;
  const placeW = 150;
  const dateW = 62;
  const timeW = 50;
  const plateW = 72;
  const nameW = contentWidth - placeW - dateW - timeW - plateW - 24;

  const notesHeight = notes
    ? doc.heightOfString(notes, { width: contentWidth - 92, lineGap: 1 })
    : 0;
  const height = 38 + (notes ? Math.max(22, notesHeight + 6) : 0);

  doc.roundedRect(margin, y, width, height, 8).fillAndStroke("#ffffff", "#cbd5e1");

  const topY = y + 9;
  let cursorX = margin + boxPadding;

  doc.font("Helvetica").fontSize(9.5).fillColor("#0f172a").text(row.place || "-", cursorX, topY, {
    width: placeW,
    ellipsis: true,
  });
  cursorX += placeW + 6;

  doc.text(formatShortDate(row.datetimeRaw), cursorX, topY, { width: dateW, align: "left" });
  cursorX += dateW + 6;

  doc.text(formatTime(row.datetimeRaw), cursorX, topY, { width: timeW, align: "left" });
  cursorX += timeW + 6;

  doc.font("Helvetica-Bold").text(row.customerName || "-", cursorX, topY, {
    width: nameW,
    ellipsis: true,
  });
  cursorX += nameW + 6;

  doc.font("Helvetica").text(row.vehiclePlate || "-", cursorX, topY, {
    width: plateW,
    align: "right",
    ellipsis: true,
  });

  if (notes) {
    doc.font("Helvetica-Bold").fontSize(8.2).fillColor(accentColor).text("Observaciones:", margin + boxPadding, y + 27, {
      width: 84,
    });
    doc.font("Helvetica").fontSize(8.4).fillColor("#475569").text(notes, margin + boxPadding + 88, y + 27, {
      width: contentWidth - 92,
      lineGap: 1,
    });
  }

  return height;
}

export async function buildOperationalListPdf(input: {
  title: string;
  from: string;
  to: string;
  rows: DeliveryPickupListRow[];
  accentColor?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    ensurePdfkitFontCompat();
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    applyPdfkitFontFallback(doc);
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = input.accentColor && /^#[0-9a-fA-F]{6}$/.test(input.accentColor) ? input.accentColor : "#2563eb";
    const margin = 34;
    const pageBottom = doc.page.height - 34;

    doc.font("Helvetica-Bold").fontSize(17).fillColor("#0f172a").text(input.title, margin, 28);
    doc.font("Helvetica").fontSize(9.5).fillColor("#475569").text(
      `${formatShortDate(input.from)} - ${formatShortDate(input.to)}`,
      margin,
      50,
    );
    doc.moveTo(margin, 70).lineTo(doc.page.width - margin, 70).lineWidth(1.2).strokeColor(accent).stroke();

    let y = 84;
    for (const row of input.rows) {
      const estimatedHeight = 74 + ((row.privateNotes || "").trim() ? 24 : 0);
      if (y + estimatedHeight > pageBottom) {
        doc.addPage();
        y = 30;
      }
      const used = drawEntry(doc, row, y, accent);
      y += used + 10;
    }

    doc.end();
  });
}
