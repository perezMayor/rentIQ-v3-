import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_BRANCH_ID, normalizeBranchId } from "@/lib/branches";
import { getCompanySettings } from "@/lib/services/rental-service";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Si ya existe sesión, no debe mostrarse formulario de login.
  const session = await getSessionUser();

  if (session) {
    redirect("/dashboard");
  }
  const params = (await searchParams) ?? {};
  const companySettings = await getCompanySettings();
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawBranch = Array.isArray(params.branch) ? params.branch[0] : params.branch;
  const companyName = companySettings.companyName?.trim() || "Empresa";
  const branches = companySettings.branches.map((branch) => ({
    id: normalizeBranchId(branch.code),
    label: `${branch.code} · ${branch.name}`,
  }));
  const selectedBranch = branches.find((item) => item.id === normalizeBranchId(rawBranch ?? ""))?.id ?? branches[0]?.id ?? DEFAULT_BRANCH_ID;
  const errorText =
    rawError === "invalid"
      ? "Credenciales inválidas."
      : rawError === "missing"
        ? "Debes completar correo y contraseña."
        : rawError === "branch_missing"
          ? "Debes configurar al menos una sucursal para acceder."
        : null;

  return (
    <main className="login-page">
      <section className="login-card">
        <Image src="/brand/rentiq-logo-dark.png" className="login-logo" alt="RentIQ" width={240} height={90} priority />
        <p className="muted-text text-center login-subtitle">Software de gestión para rent a car</p>
        {errorText ? <p className="login-error">{errorText}</p> : null}
        <form action="/api/login" method="POST" className="stack-md">
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <label>Empresa</label>
          <p className="login-company-name" aria-label="Empresa">
            {companyName}
          </p>
          <label htmlFor="branch">Sucursal</label>
          <select id="branch" name="branch" defaultValue={selectedBranch} required disabled={branches.length === 0}>
            {branches.length === 0 ? <option value="">Sin sucursales configuradas</option> : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.label}
              </option>
            ))}
          </select>
          <button className="primary-btn" type="submit">
            Entrar
          </button>
          <Link href="/login/recuperar" className="text-center muted-text">
            He olvidado mi contraseña
          </Link>
        </form>
      </section>
    </main>
  );
}
