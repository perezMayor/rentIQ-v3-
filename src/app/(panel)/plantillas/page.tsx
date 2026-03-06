import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { TEMPLATE_MACRO_GROUPS } from "@/lib/services/template-macro-catalog";
import { getTemplatePresetHtml } from "@/lib/services/template-presets";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{
    q?: string;
    error?: string;
    ok?: string;
    mode?: string;
    code?: string;
    language?: string;
  }>;
};

const DEFAULT_LANGUAGES = ["es", "en"];

export default async function PlantillasPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const mode = (params.mode ?? "").trim().toLowerCase();
  const canWrite = user.role !== "LECTOR";
  const templates = await listTemplates(q);

  const templateCodes = Array.from(new Set(templates.map((item) => item.templateCode))).toSorted((a, b) => a.localeCompare(b));
  const selectedCode = (params.code ?? templateCodes[0] ?? "").trim().toUpperCase();
  const templatesByCode = templates.filter((item) => item.templateCode === selectedCode);
  const availableLanguages =
    templatesByCode.length > 0
      ? Array.from(new Set(templatesByCode.map((item) => item.language))).toSorted((a, b) => a.localeCompare(b))
      : DEFAULT_LANGUAGES;
  const selectedLanguage = (params.language ?? availableLanguages[0] ?? "es").trim().toLowerCase();
  const selectedTemplate = templatesByCode.find((item) => item.language === selectedLanguage) ?? null;

  async function createTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await createTemplate(input, { id: actor.id, role: actor.role });
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent((input.templateCode ?? "").toUpperCase())}&language=${encodeURIComponent((input.language ?? "es").toLowerCase())}&ok=${encodeURIComponent("Plantilla creada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando plantilla";
      redirect(`/plantillas?mode=new&error=${encodeURIComponent(message)}`);
    }
  }

  async function createTemplatePresetAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const templateCode = String(formData.get("templateCode") ?? "").trim().toUpperCase();
    const templateType = String(formData.get("templateType") ?? "CONFIRMACION_RESERVA").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();
    const title = String(formData.get("title") ?? "").trim();

    try {
      await createTemplate(
        {
          templateCode,
          templateType,
          language,
          title,
          htmlContent: getTemplatePresetHtml(templateType as "CONTRATO" | "CONFIRMACION_RESERVA" | "FACTURA", language),
        },
        { id: actor.id, role: actor.role },
      );
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(templateCode)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla base creada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error creando plantilla base";
      redirect(`/plantillas?mode=new&error=${encodeURIComponent(message)}`);
    }
  }

  async function updateTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const templateId = String(formData.get("templateId") ?? "");
    const code = String(formData.get("templateCode") ?? "").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();

    try {
      await updateTemplate(Object.fromEntries(formData.entries()) as Record<string, string>, { id: actor.id, role: actor.role });
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla actualizada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error actualizando plantilla";
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent(message)}&templateId=${encodeURIComponent(templateId)}`);
    }
  }

  async function uploadTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const templateId = String(formData.get("templateId") ?? "").trim();
    const code = String(formData.get("templateCode") ?? "").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();
    const title = String(formData.get("title") ?? "Plantilla").trim();
    const templateType = String(formData.get("templateType") ?? "CONTRATO").trim().toUpperCase();
    const file = formData.get("htmlFile");

    if (!(file instanceof File) || file.size === 0) {
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent("Selecciona un archivo HTML")}`);
    }

    const htmlContent = (await file.text()).trim();
    if (!htmlContent) {
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent("El archivo está vacío")}`);
    }

    try {
      if (templateId) {
        await updateTemplate(
          {
            templateId,
            language,
            htmlContent,
            title,
            active: "true",
          },
          { id: actor.id, role: actor.role },
        );
      } else {
        await createTemplate(
          {
            templateCode: code,
            templateType,
            language,
            title,
            htmlContent,
          },
          { id: actor.id, role: actor.role },
        );
      }
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla cargada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error cargando plantilla";
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const templateId = String(formData.get("templateId") ?? "").trim();
    const code = String(formData.get("templateCode") ?? "").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();

    try {
      await deleteTemplate(templateId, { id: actor.id, role: actor.role });
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla borrada")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error borrando plantilla";
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p className="success-text">{params.ok}</p> : null}
      <section className="card stack-sm">
        <h3>Gestor de plantillas</h3>
        <form method="GET" className="inline-search">
          <select name="code" defaultValue={selectedCode || ""}>
            {templateCodes.length === 0 ? <option value="">Sin plantillas</option> : null}
            {templateCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select name="language" defaultValue={selectedLanguage}>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
          <input type="hidden" name="q" value={q} />
          <a className="secondary-btn text-center" href="/gestor?tab=plantillas">Volver al gestor</a>
          <button className="secondary-btn" type="submit">Aplicar</button>
          <a className="primary-btn text-center" href="/plantillas?mode=new">Nueva plantilla</a>
          <a
            className="secondary-btn text-center"
            href={selectedTemplate ? `/api/plantillas/${selectedTemplate.id}/download` : "#"}
            aria-disabled={!selectedTemplate}
          >
            Descargar plantilla
          </a>
          <a className="secondary-btn text-center" href={selectedTemplate ? "#vista-plantilla" : "#"} aria-disabled={!selectedTemplate}>
            Ver plantilla
          </a>
        </form>

        <form action={uploadTemplateAction} className="inline-search">
          <input type="hidden" name="templateId" value={selectedTemplate?.id ?? ""} />
          <input type="hidden" name="templateCode" value={selectedCode} />
          <input type="hidden" name="language" value={selectedLanguage} />
          <input type="hidden" name="title" value={selectedTemplate?.title ?? selectedCode} />
          <input type="hidden" name="templateType" value={selectedTemplate?.templateType ?? "CONTRATO"} />
          <input name="htmlFile" type="file" accept=".html,text/html" disabled={!canWrite} />
          <button className="secondary-btn" type="submit" disabled={!canWrite}>Cargar plantilla</button>
        </form>
      </section>

      {mode === "new" || !selectedTemplate ? (
        <section className="card stack-sm">
          <h3>Nueva plantilla</h3>
          <form action={createTemplateAction} className="form-grid">
            <label>
              Código plantilla
              <input name="templateCode" placeholder="CONF_RES" disabled={!canWrite} />
            </label>
            <label>
              Tipo
              <select name="templateType" defaultValue="CONFIRMACION_RESERVA" disabled={!canWrite}>
                <option value="CONTRATO">Contrato</option>
                <option value="CONFIRMACION_RESERVA">Confirmación reserva</option>
                <option value="FACTURA">Factura</option>
              </select>
            </label>
            <label>
              Idioma
              <select name="language" defaultValue="es" disabled={!canWrite}>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            </label>
            <label>
              Título
              <input name="title" placeholder="Plantilla base" disabled={!canWrite} />
            </label>
            <label className="col-span-2">
              HTML
              <textarea name="htmlContent" rows={12} disabled={!canWrite} defaultValue={getTemplatePresetHtml("CONFIRMACION_RESERVA", "es")} />
            </label>
            <div className="col-span-2">
              <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar plantilla</button>
            </div>
          </form>

          <form action={createTemplatePresetAction} className="form-grid">
            <label>
              Código plantilla
              <input name="templateCode" placeholder="CTR_BASE_ES" disabled={!canWrite} />
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
              <select name="language" defaultValue="es" disabled={!canWrite}>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            </label>
            <label>
              Título
              <input name="title" placeholder="Plantilla base" disabled={!canWrite} />
            </label>
            <div className="col-span-2">
              <button className="secondary-btn" type="submit" disabled={!canWrite}>Crear plantilla base</button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedTemplate ? (
        <>
          <section className="card stack-sm">
            <h3>Plantilla seleccionada</h3>
            <form action={updateTemplateAction} className="stack-sm">
              <input type="hidden" name="templateId" value={selectedTemplate.id} />
              <input type="hidden" name="templateCode" value={selectedTemplate.templateCode} />
              <input type="hidden" name="language" value={selectedTemplate.language} />
              <label>
                Título
                <input name="title" defaultValue={selectedTemplate.title} disabled={!canWrite} />
              </label>
              <label>
                Activa
                <select name="active" defaultValue={selectedTemplate.active ? "true" : "false"} disabled={!canWrite}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                HTML
                <textarea name="htmlContent" defaultValue={selectedTemplate.htmlContent} rows={14} disabled={!canWrite} />
              </label>
              <div className="table-header-row">
                <button className="secondary-btn" type="submit" disabled={!canWrite}>Guardar cambios</button>
              </div>
            </form>
            <form action={deleteTemplateAction}>
              <input type="hidden" name="templateId" value={selectedTemplate.id} />
              <input type="hidden" name="templateCode" value={selectedTemplate.templateCode} />
              <input type="hidden" name="language" value={selectedTemplate.language} />
              <button className="secondary-btn" type="submit" disabled={!canWrite}>Borrar plantilla</button>
            </form>
          </section>

          <section id="vista-plantilla" className="card stack-sm">
            <h3>Vista previa</h3>
            <div className="html-preview" dangerouslySetInnerHTML={{ __html: selectedTemplate.htmlContent }} />
          </section>
        </>
      ) : null}

      <section className="card stack-sm">
        <h3>Macros</h3>
        <div className="stack-sm">
          {TEMPLATE_MACRO_GROUPS.map((group) => (
            <details key={group.key} className="card">
              <summary>{group.title}</summary>
              <div style={{ marginTop: "0.5rem", overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Macro</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.macros.map((row) => (
                      <tr key={`${group.key}-${row.macro}`}>
                        <td>{row.macro.startsWith("{") ? row.macro : `{${row.macro}}`}</td>
                        <td>{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
