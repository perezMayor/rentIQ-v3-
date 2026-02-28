import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDocumentCompanyName } from "@/lib/company-brand";
import { getCompanySettings, updateCompanySettings } from "@/lib/services/rental-service";

type ConfigTab = "identidad" | "branding" | "fiscal";
type ConfigSubtab = "basico" | "contacto" | "logo" | "colores" | "facturacion" | "operativa";

type Props = {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    tab?: string;
    subtab?: string;
  }>;
};

function normalizeTab(value: string): ConfigTab {
  if (value === "branding" || value === "fiscal") return value;
  return "identidad";
}

function normalizeSubtab(tab: ConfigTab, value: string): ConfigSubtab {
  if (tab === "identidad") return value === "contacto" ? "contacto" : "basico";
  if (tab === "branding") return value === "colores" ? "colores" : "logo";
  return value === "operativa" ? "operativa" : "facturacion";
}

export default async function ConfiguracionPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const canWrite = user.role !== "LECTOR";
  const settings = await getCompanySettings();
  const params = await searchParams;
  const tab = normalizeTab((params.tab ?? "identidad").toLowerCase());
  const subtab = normalizeSubtab(tab, (params.subtab ?? "").toLowerCase());

  async function saveSettingsAction(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) redirect("/login");
    const nextTab = normalizeTab(String(formData.get("tab") ?? "identidad").toLowerCase());
    const nextSubtab = normalizeSubtab(nextTab, String(formData.get("subtab") ?? "").toLowerCase());
    if (actor.role === "LECTOR") redirect(`/configuracion?tab=${nextTab}&subtab=${nextSubtab}&error=Permiso+denegado`);

    const input = Object.fromEntries(formData.entries()) as Record<string, string>;
    const removeLogo = String(formData.get("removeLogo") ?? "") === "true";
    const logoFile = formData.get("logoFile");
    if (removeLogo) {
      input.logoDataUrl = "";
    }
    if (!removeLogo && logoFile instanceof File && logoFile.size > 0) {
      if (!logoFile.type.startsWith("image/")) {
        redirect(`/configuracion?tab=${nextTab}&subtab=${nextSubtab}&error=El+logo+debe+ser+una+imagen+valida`);
      }
      const maxBytes = 2 * 1024 * 1024;
      if (logoFile.size > maxBytes) {
        redirect(`/configuracion?tab=${nextTab}&subtab=${nextSubtab}&error=Logo+demasiado+grande+(max+2MB)`);
      }
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      input.logoDataUrl = `data:${logoFile.type};base64,${buffer.toString("base64")}`;
    }

    try {
      await updateCompanySettings(input, { id: actor.id, role: actor.role });
      revalidatePath("/configuracion");
      revalidatePath("/gestor");
      redirect(`/configuracion?tab=${nextTab}&subtab=${nextSubtab}&ok=Configuracion+guardada`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando configuracion";
      redirect(`/configuracion?tab=${nextTab}&subtab=${nextSubtab}&error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <h2>Configuración de la empresa</h2>
        <p className="muted-text">Estructura por pestañas y subpestañas para mantener patrón operativo consistente.</p>
      </header>

      {params.error ? <p className="danger-text">{params.error}</p> : null}
      {params.ok ? <p>{params.ok}</p> : null}
      {!canWrite ? <p className="danger-text">Modo lectura: no puedes editar configuración.</p> : null}

      <section className="card stack-sm">
        <div className="inline-actions-cell">
          <a className={tab === "identidad" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=identidad&subtab=basico">Identidad</a>
          <a className={tab === "branding" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=branding&subtab=logo">Branding</a>
          <a className={tab === "fiscal" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=fiscal&subtab=facturacion">Fiscal y operativa</a>
        </div>
      </section>

      <section className="card stack-md">
        {tab === "identidad" ? (
          <>
            <div className="inline-actions-cell">
              <a className={subtab === "basico" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=identidad&subtab=basico">Básico</a>
              <a className={subtab === "contacto" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=identidad&subtab=contacto">Contacto</a>
            </div>
            {subtab === "basico" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="identidad" />
                <input type="hidden" name="subtab" value="basico" />
                <label>
                  Nombre comercial
                  <input name="companyName" defaultValue={settings.companyName} disabled={!canWrite} />
                </label>
                <label>
                  Razón social
                  <input name="legalName" defaultValue={settings.legalName} disabled={!canWrite} />
                </label>
                <label className="col-span-2">
                  Nombre en documentos
                  <input name="documentBrandName" defaultValue={settings.documentBrandName} disabled={!canWrite} />
                </label>
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
            {subtab === "contacto" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="identidad" />
                <input type="hidden" name="subtab" value="contacto" />
                <label>
                  Email emisor
                  <input name="companyEmailFrom" type="email" defaultValue={settings.companyEmailFrom} disabled={!canWrite} />
                </label>
                <label>
                  Teléfono
                  <input name="companyPhone" defaultValue={settings.companyPhone} disabled={!canWrite} />
                </label>
                <label className="col-span-2">
                  Web
                  <input name="companyWebsite" defaultValue={settings.companyWebsite} disabled={!canWrite} />
                </label>
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}

        {tab === "branding" ? (
          <>
            <div className="inline-actions-cell">
              <a className={subtab === "logo" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=branding&subtab=logo">Logo</a>
              <a className={subtab === "colores" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=branding&subtab=colores">Colores y pie</a>
            </div>
            {subtab === "logo" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="branding" />
                <input type="hidden" name="subtab" value="logo" />
                <label className="col-span-2">
                  Logo empresa
                  <input name="logoFile" type="file" accept="image/*" disabled={!canWrite} />
                </label>
                <label className="col-span-2 inline-actions-cell">
                  <input name="removeLogo" type="checkbox" value="true" disabled={!canWrite} />
                  Quitar logo actual
                </label>
                {settings.logoDataUrl ? (
                  <div className="col-span-2 stack-sm">
                    <span className="muted-text">Logo actual</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.logoDataUrl} alt="Logo empresa" style={{ maxHeight: 72, maxWidth: 260, objectFit: "contain" }} />
                  </div>
                ) : null}
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
            {subtab === "colores" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="branding" />
                <input type="hidden" name="subtab" value="colores" />
                <label>
                  Color principal documentos
                  <input name="brandPrimaryColor" type="color" defaultValue={settings.brandPrimaryColor || "#2563eb"} disabled={!canWrite} />
                </label>
                <label>
                  Color secundario documentos
                  <input name="brandSecondaryColor" type="color" defaultValue={settings.brandSecondaryColor || "#0f172a"} disabled={!canWrite} />
                </label>
                <label className="col-span-2">
                  Pie de documento
                  <textarea name="documentFooter" rows={3} defaultValue={settings.documentFooter || ""} disabled={!canWrite} />
                </label>
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}

        {tab === "fiscal" ? (
          <>
            <div className="inline-actions-cell">
              <a className={subtab === "facturacion" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=fiscal&subtab=facturacion">Facturación</a>
              <a className={subtab === "operativa" ? "primary-btn text-center" : "secondary-btn text-center"} href="/configuracion?tab=fiscal&subtab=operativa">Operativa</a>
            </div>
            {subtab === "facturacion" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="fiscal" />
                <input type="hidden" name="subtab" value="facturacion" />
                <label>
                  CIF/NIF
                  <input name="taxId" defaultValue={settings.taxId} disabled={!canWrite} />
                </label>
                <label className="col-span-2">
                  Dirección fiscal
                  <input name="fiscalAddress" defaultValue={settings.fiscalAddress} disabled={!canWrite} />
                </label>
                <label>
                  IVA por defecto (%)
                  <input name="defaultIvaPercent" type="number" step="0.01" defaultValue={settings.defaultIvaPercent} disabled={!canWrite} />
                </label>
                <label>
                  Serie facturas alquiler (F)
                  <input name="invoiceSeriesF" defaultValue={settings.invoiceSeriesByType.F} disabled={!canWrite} />
                </label>
                <label>
                  Serie rectificativas (R)
                  <input name="invoiceSeriesR" defaultValue={settings.invoiceSeriesByType.R} disabled={!canWrite} />
                </label>
                <label>
                  Serie venta (V)
                  <input name="invoiceSeriesV" defaultValue={settings.invoiceSeriesByType.V} disabled={!canWrite} />
                </label>
                <label>
                  Serie abonos (A)
                  <input name="invoiceSeriesA" defaultValue={settings.invoiceSeriesByType.A} disabled={!canWrite} />
                </label>
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
            {subtab === "operativa" ? (
              <form action={saveSettingsAction} className="form-grid">
                <input type="hidden" name="tab" value="fiscal" />
                <input type="hidden" name="subtab" value="operativa" />
                <label>
                  Retención backups (días)
                  <input name="backupRetentionDays" type="number" min={1} defaultValue={settings.backupRetentionDays} disabled={!canWrite} />
                </label>
                <label className="col-span-2">
                  Proveedores/propietarios de coche (1 por línea)
                  <textarea name="providersRaw" rows={5} defaultValue={(settings.providers ?? []).join("\n")} disabled={!canWrite} />
                </label>
                <div className="col-span-2">
                  <button className="primary-btn" type="submit" disabled={!canWrite}>Guardar</button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="card stack-sm">
        <h3>Resumen activo en documentos</h3>
        <p><strong>Nombre mostrado:</strong> {getDocumentCompanyName(settings)}</p>
        <p><strong>CIF/NIF:</strong> {settings.taxId || "N/D"}</p>
        <p><strong>Dirección fiscal:</strong> {settings.fiscalAddress || "N/D"}</p>
      </section>
    </div>
  );
}
