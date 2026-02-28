import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildContractPreprintDocument } from "@/lib/services/contract-preprint-document-service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const language = (url.searchParams.get("language") ?? "es").trim();

  try {
    const document = await buildContractPreprintDocument(language);
    return new NextResponse(document.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"contrato-en-blanco.html\"",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error generando preimpresión";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
