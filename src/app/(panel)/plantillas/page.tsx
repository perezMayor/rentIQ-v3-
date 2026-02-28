import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{ q?: string; error?: string }>;
};

export default async function PlantillasPage({ searchParams }: Props) {
  // Gestión de plantillas HTML por tipo documental e idioma.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const q = params.q ?? "";
  const canWrite = user.role !== "LECTOR";
  const templates = await listTemplates(q);

  // Server Action: alta de nueva plantilla.
  async function createTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/plantillas?error=Permiso+denegado");
    }
    try {
      await createTemplate(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/plantillas");
      redirect("/plantillas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando plantilla";
      redirect(`/plantillas?error=${encodeURIComponent(message)}`);
    }
  }

  // Server Action: edición de plantilla existente.
  async function updateTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/plantillas?error=Permiso+denegado");
    }
    try {
      await updateTemplate(Object.fromEntries(formData.entries()) as Record<string, string>, {
        id: actor.id,
        role: actor.role,
      });
      revalidatePath("/plantillas");
      redirect("/plantillas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando plantilla";
      redirect(`/plantillas?error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) {
      redirect("/login");
    }
    if (actor.role === "LECTOR") {
      redirect("/plantillas?error=Permiso+denegado");
    }
    const templateId = String(formData.get("templateId") ?? "");
    try {
      await deleteTemplate(templateId, { id: actor.id, role: actor.role });
      revalidatePath("/plantillas");
      redirect("/plantillas");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando plantilla";
      redirect(`/plantillas?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Plantillas</h2>
        <p className="muted-text">Colección HTML multi-idioma para contrato, confirmación y factura.</p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {!canWrite ? <p className="danger-text">Modo lectura: no puedes editar plantillas.</p> : null}

      <section className="card stack-md">
        <h3>Nueva plantilla</h3>
        <form action={createTemplateAction} className="form-grid">
          <label>
            Código plantilla
            <input name="templateCode" placeholder="CTR_BASE" disabled={!canWrite} />
          </label>
          <label>
            Tipo
            <select name="templateType" defaultValue="CONTRATO" disabled={!canWrite}>
              <option value="CONTRATO">Contrato</option>
              <option value="CONFIRMACION_RESERVA">Confirmación reserva</option>
              <option value="FACTURA">Factura</option>
            </select>
          </label>
          <label>
            Idioma
            <input name="language" placeholder="es" disabled={!canWrite} />
          </label>
          <label>
            Título
            <input name="title" placeholder="Contrato base ES" disabled={!canWrite} />
          </label>
          <label className="col-span-2">
            HTML
            <textarea
              name="htmlContent"
              rows={8}
              disabled={!canWrite}
              defaultValue={'<section><h1>{{company_name}}</h1><p>Contrato {{contract_number}}</p></section>'}
            />
          </label>
          <div className="col-span-2">
            <button className="primary-btn" type="submit" disabled={!canWrite}>
              Guardar plantilla
            </button>
          </div>
        </form>
      </section>

      <section className="card stack-sm">
        <div className="table-header-row">
          <h3>Listado plantillas</h3>
          <form method="GET" className="inline-search">
            <input name="q" defaultValue={q} placeholder="código, tipo, idioma..." />
            <button className="secondary-btn" type="submit">Buscar</button>
          </form>
        </div>

        {templates.length === 0 ? (
          <p className="muted-text">Sin plantillas.</p>
        ) : (
          <div className="stack-md">
            {templates.map((template) => (
              <details key={template.id} className="card">
                <summary>
                  {template.templateCode} | {template.templateType} | {template.language} | {template.active ? "Activa" : "Inactiva"}
                </summary>
                <form action={updateTemplateAction} className="stack-sm" style={{ marginTop: "0.75rem" }}>
                  <input type="hidden" name="templateId" value={template.id} />
                  <label>
                    Título
                    <input name="title" defaultValue={template.title} disabled={!canWrite} />
                  </label>
                  <label>
                    Idioma
                    <input name="language" defaultValue={template.language} disabled={!canWrite} />
                  </label>
                  <label>
                    Activa
                    <select name="active" defaultValue={template.active ? "true" : "false"} disabled={!canWrite}>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                  <label>
                    HTML (editor visual base)
                    <textarea name="htmlContent" defaultValue={template.htmlContent} rows={10} disabled={!canWrite} />
                  </label>
                  <button className="secondary-btn" type="submit" disabled={!canWrite}>Actualizar</button>
                </form>
                <form action={deleteTemplateAction} className="stack-sm" style={{ marginTop: "0.75rem" }}>
                  <input type="hidden" name="templateId" value={template.id} />
                  <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar plantilla</button>
                </form>
                <details style={{ marginTop: "0.5rem" }}>
                  <summary>Vista previa HTML</summary>
                  <div
                    className="html-preview"
                    dangerouslySetInnerHTML={{ __html: template.htmlContent }}
                  />
                </details>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
