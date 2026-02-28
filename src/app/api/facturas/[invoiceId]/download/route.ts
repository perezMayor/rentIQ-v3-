import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildInvoiceDocument } from "@/lib/services/invoice-document-service";

export async function GET(_: Request, context: { params: Promise<{ invoiceId: string }> }) {
  // Descarga protegida por sesión.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { invoiceId } = await context.params;

  try {
    // Genera PDF al vuelo desde plantilla y datos actuales.
    const document = await buildInvoiceDocument(invoiceId);
    return new NextResponse(new Uint8Array(document.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${document.invoice.invoiceNumber}.pdf\"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error generando factura";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
