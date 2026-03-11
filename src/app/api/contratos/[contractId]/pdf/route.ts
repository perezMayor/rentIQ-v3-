// Endpoint HTTP de contratos/[contractId]/pdf.
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildContractDocument } from "@/lib/services/contract-document-service";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ contractId: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { contractId } = await context.params;

  try {
    const document = await buildContractDocument(contractId);
    return new Response(document.pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${document.contract.contractNumber}.pdf\"`,
        "Content-Length": String(document.pdfBuffer.length),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error generando contrato";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
