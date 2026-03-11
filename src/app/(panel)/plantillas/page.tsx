import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getActionErrorMessage } from "@/lib/action-errors";
import { TEMPLATE_MACRO_GROUPS } from "@/lib/services/template-macro-catalog";
import { getTemplatePresetHtml } from "@/lib/services/template-presets";
import {
  buildVisualTemplateHtml,
  decodeVisualTemplateConfig,
  defaultVisualTemplateConfig,
  type VisualTemplateType,
} from "@/lib/services/template-visual-builder";
import { createTemplate, deleteTemplate, getCompanySettings, listTemplates, updateCompanySettings, updateTemplate } from "@/lib/services/rental-service";

type Props = {
  searchParams: Promise<{
    q?: string;
    error?: string;
    ok?: string;
    mode?: string;
    code?: string;
    language?: string;
    templateType?: string;
  }>;
};

const DEFAULT_LANGUAGES = ["es", "en"];
const VISUAL_TEMPLATE_TYPES = ["CONFIRMACION_RESERVA", "PRESUPUESTO"] as const;

export default async function PlantillasPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const mode = (params.mode ?? "").trim().toLowerCase();
  const canWrite = user.role !== "LECTOR";
  const templates = await listTemplates(q);
  const settings = await getCompanySettings();

  const templateCodes = Array.from(new Set(templates.map((item) => item.templateCode))).toSorted((a, b) => a.localeCompare(b));
  const selectedCode = (params.code ?? templateCodes[0] ?? "").trim().toUpperCase();
  const templatesByCode = templates.filter((item) => item.templateCode === selectedCode);
  const availableLanguages =
    templatesByCode.length > 0
      ? Array.from(new Set(templatesByCode.map((item) => item.language))).toSorted((a, b) => a.localeCompare(b))
      : DEFAULT_LANGUAGES;
  const selectedLanguage = (params.language ?? availableLanguages[0] ?? "es").trim().toLowerCase();
  const selectedTemplate = templatesByCode.find((item) => item.language === selectedLanguage) ?? null;
  const requestedTemplateType = (params.templateType ?? "").trim().toUpperCase();
  const selectedTemplateType =
    mode === "new"
      ? ((requestedTemplateType === "PRESUPUESTO" || requestedTemplateType === "CONFIRMACION_RESERVA") ? requestedTemplateType : "CONFIRMACION_RESERVA")
      : (selectedTemplate?.templateType ?? "CONTRATO");
  const selectedVisualType = VISUAL_TEMPLATE_TYPES.includes(selectedTemplateType as (typeof VISUAL_TEMPLATE_TYPES)[number])
    ? (selectedTemplateType as VisualTemplateType)
    : null;
  const parsedVisualConfig = selectedTemplate ? decodeVisualTemplateConfig(selectedTemplate.htmlContent) : null;
  const visualConfig =
    parsedVisualConfig?.templateType === selectedVisualType
      ? parsedVisualConfig.config
      : selectedVisualType
        ? defaultVisualTemplateConfig(selectedVisualType, selectedLanguage)
        : null;

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
      const message = getActionErrorMessage(error, "Error creando plantilla");
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
          htmlContent: getTemplatePresetHtml(templateType as "CONTRATO" | "CONFIRMACION_RESERVA" | "PRESUPUESTO" | "FACTURA", language),
        },
        { id: actor.id, role: actor.role },
      );
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(templateCode)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla base creada")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error creando plantilla base");
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
      const message = getActionErrorMessage(error, "Error actualizando plantilla");
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
      const message = getActionErrorMessage(error, "Error cargando plantilla");
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
      const message = getActionErrorMessage(error, "Error borrando plantilla");
      redirect(`/plantillas?code=${encodeURIComponent(code)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent(message)}`);
    }
  }

  async function saveContractReverseAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    try {
      await updateCompanySettings(input, { id: actor.id, role: actor.role });
      revalidatePath("/plantillas");
      redirect(`/plantillas?ok=${encodeURIComponent("Reverso de contrato actualizado")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error guardando reverso");
      redirect(`/plantillas?error=${encodeURIComponent(message)}`);
    }
  }

  async function saveVisualTemplateAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    if (actor.role === "LECTOR") redirect("/plantillas?error=Permiso+denegado");

    const templateId = String(formData.get("templateId") ?? "").trim();
    const templateCode = String(formData.get("templateCode") ?? "").trim().toUpperCase();
    const templateType = String(formData.get("templateType") ?? "CONFIRMACION_RESERVA").trim().toUpperCase();
    const language = String(formData.get("language") ?? "es").trim().toLowerCase();
    const title = String(formData.get("title") ?? "").trim();
    const visualType = templateType === "PRESUPUESTO" ? "PRESUPUESTO" : "CONFIRMACION_RESERVA";
    const htmlContent = buildVisualTemplateHtml(visualType, language, {
      title: String(formData.get("visualTitle") ?? "").trim(),
      intro: String(formData.get("visualIntro") ?? "").trim(),
      footer: String(formData.get("visualFooter") ?? "").trim(),
      showCompany: formData.get("showCompany") === "true",
      showReservationBlock: formData.get("showReservationBlock") === "true",
      showBaseData: formData.get("showBaseData") === "true",
      showPricingBlock: formData.get("showPricingBlock") === "true",
      showExtrasTable: formData.get("showExtrasTable") === "true",
      showObservations: formData.get("showObservations") === "true",
    });

    try {
      if (templateId) {
        await updateTemplate(
          {
            templateId,
            templateCode,
            language,
            title,
            htmlContent,
            active: String(formData.get("active") ?? "true"),
          },
          { id: actor.id, role: actor.role },
        );
      } else {
        await createTemplate(
          {
            templateCode,
            templateType,
            language,
            title,
            htmlContent,
          },
          { id: actor.id, role: actor.role },
        );
      }
      revalidatePath("/plantillas");
      redirect(`/plantillas?code=${encodeURIComponent(templateCode)}&language=${encodeURIComponent(language)}&ok=${encodeURIComponent("Plantilla visual guardada")}`);
    } catch (error) {
      const message = getActionErrorMessage(error, "Error guardando plantilla visual");
      redirect(`/plantillas?code=${encodeURIComponent(templateCode)}&language=${encodeURIComponent(language)}&error=${encodeURIComponent(message)}${templateId ? `&templateId=${encodeURIComponent(templateId)}` : "&mode=new"}`);
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
          <a className="primary-btn text-center" href="/plantillas?mode=new&templateType=CONFIRMACION_RESERVA">Nueva confirmación</a>
          <a className="secondary-btn text-center" href="/plantillas?mode=new&templateType=PRESUPUESTO">Nuevo presupuesto</a>
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

      <section className="card stack-sm">
        <h3>Reverso contrato</h3>
        <form action={saveContractReverseAction} className="form-grid">
          <div className="col-span-2 contract-reverse-topbar">
            <label className="field-compact">
              Maquetación
              <select name="contractBackLayout" defaultValue={settings.contractBackLayout === "DUAL" ? "DUAL" : "SINGLE"} disabled={!canWrite}>
                <option value="SINGLE">Monoidioma</option>
                <option value="DUAL">Bilingüe</option>
              </select>
            </label>
            <label className="field-compact">
              Tipo de contenido
              <select name="contractBackContentType" defaultValue={settings.contractBackContentType === "HTML" ? "HTML" : "TEXT"} disabled={!canWrite}>
                <option value="TEXT">Texto libre</option>
                <option value="HTML">HTML</option>
              </select>
            </label>
            <label className="field-compact contract-reverse-font">
              Tamaño de letra
              <input
                name="contractBackFontSize"
                type="number"
                step="0.1"
                min="4.8"
                max="12"
                defaultValue={settings.contractBackFontSize || 7.6}
                disabled={!canWrite}
              />
            </label>
          </div>
          <div className="col-span-2 template-panel-grid">
            <section className="card template-panel-card stack-sm">
              <h3>Español</h3>
              <div className="template-card-scroll contract-reverse-editor">
                <textarea name="contractBackContentEs" rows={18} defaultValue={settings.contractBackContentEs || ""} disabled={!canWrite} />
              </div>
            </section>
            <section className="card template-panel-card stack-sm">
              <h3>Inglés</h3>
              <div className="template-card-scroll contract-reverse-editor">
                <textarea name="contractBackContentEn" rows={18} defaultValue={settings.contractBackContentEn || ""} disabled={!canWrite} />
              </div>
            </section>
          </div>
          <details className="col-span-2 card contract-reverse-legacy">
            <summary>Compatibilidad contenido único</summary>
            <label>
              Contenido único
              <textarea name="contractBackContent" rows={6} defaultValue={settings.contractBackContent || ""} disabled={!canWrite} />
            </label>
          </details>
          <div className="col-span-2">
            <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar reverso</button>
          </div>
        </form>
      </section>

      {selectedVisualType && visualConfig ? (
        <section className="card stack-sm">
          <h3>Editor visual básico</h3>
          <form action={saveVisualTemplateAction} className="form-grid">
            <input type="hidden" name="templateId" value={selectedTemplate?.id ?? ""} />
            {selectedTemplate ? <input type="hidden" name="templateCode" value={selectedTemplate.templateCode} /> : null}
            {selectedTemplate ? <input type="hidden" name="templateType" value={selectedVisualType} /> : null}
            {selectedTemplate ? <input type="hidden" name="language" value={selectedTemplate.language} /> : null}
            {!selectedTemplate ? (
              <label>
                Código plantilla
                <input
                  name="templateCode"
                  defaultValue={selectedVisualType === "PRESUPUESTO" ? "PRES_BASE_ES" : "CONF_RES_ES_BASE"}
                  disabled={!canWrite}
                />
              </label>
            ) : null}
            {!selectedTemplate ? (
              <label>
                Tipo
                <select name="templateType" defaultValue={selectedVisualType} disabled={!canWrite}>
                  <option value="CONFIRMACION_RESERVA">Confirmación reserva</option>
                  <option value="PRESUPUESTO">Presupuesto</option>
                </select>
              </label>
            ) : null}
            {!selectedTemplate ? (
              <label>
                Idioma
                <select name="language" defaultValue={selectedLanguage} disabled={!canWrite}>
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                </select>
              </label>
            ) : null}
            <label>
              Título interno
              <input name="title" defaultValue={selectedTemplate?.title ?? visualConfig.title} disabled={!canWrite} />
            </label>
            <label>
              Título visible
              <input name="visualTitle" defaultValue={visualConfig.title} disabled={!canWrite} />
            </label>
            <label className="col-span-2">
              Texto introductorio
              <textarea name="visualIntro" rows={3} defaultValue={visualConfig.intro} disabled={!canWrite} />
            </label>
            <div className="col-span-2 visual-template-blocks">
              <label><input type="hidden" name="showCompany" value="false" /><input type="checkbox" name="showCompany" value="true" defaultChecked={visualConfig.showCompany} disabled={!canWrite} /> Cabecera empresa</label>
              {selectedVisualType === "CONFIRMACION_RESERVA" ? (
                <label><input type="hidden" name="showReservationBlock" value="false" /><input type="checkbox" name="showReservationBlock" value="true" defaultChecked={visualConfig.showReservationBlock} disabled={!canWrite} /> Datos de reserva</label>
              ) : null}
              {selectedVisualType === "PRESUPUESTO" ? (
                <label><input type="hidden" name="showBaseData" value="false" /><input type="checkbox" name="showBaseData" value="true" defaultChecked={visualConfig.showBaseData} disabled={!canWrite} /> Datos base del presupuesto</label>
              ) : null}
              <label><input type="hidden" name="showPricingBlock" value="false" /><input type="checkbox" name="showPricingBlock" value="true" defaultChecked={visualConfig.showPricingBlock} disabled={!canWrite} /> Resumen económico</label>
              <label><input type="hidden" name="showExtrasTable" value="false" /><input type="checkbox" name="showExtrasTable" value="true" defaultChecked={visualConfig.showExtrasTable} disabled={!canWrite} /> Detalle de conceptos</label>
              {selectedVisualType === "CONFIRMACION_RESERVA" ? (
                <label><input type="hidden" name="showObservations" value="false" /><input type="checkbox" name="showObservations" value="true" defaultChecked={visualConfig.showObservations} disabled={!canWrite} /> Observaciones</label>
              ) : (
                <input type="hidden" name="showObservations" value="false" />
              )}
            </div>
            <label className="col-span-2">
              Pie adicional
              <textarea name="visualFooter" rows={3} defaultValue={visualConfig.footer} disabled={!canWrite} />
            </label>
            {selectedTemplate ? (
              <label>
                Activa
                <select name="active" defaultValue={selectedTemplate.active ? "true" : "false"} disabled={!canWrite}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </label>
            ) : (
              <input type="hidden" name="active" value="true" />
            )}
            <div className="col-span-2">
              <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar editor visual</button>
            </div>
          </form>
        </section>
      ) : null}

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
                <option value="PRESUPUESTO">Presupuesto</option>
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
                <option value="PRESUPUESTO">Presupuesto</option>
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
