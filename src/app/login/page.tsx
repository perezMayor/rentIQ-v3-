import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { BRANCHES, DEFAULT_BRANCH_ID, isBranchId, type BranchId } from "@/lib/branches";
import { getCompanySettings } from "@/lib/services/rental-service";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Si ya existe sesión, no debe mostrarse formulario de login.
  const session = await getSessionUser();

  if (session) {
    redirect("/dashboard");
  }
  const params = await Promise.resolve(searchParams ?? {});
  const companySettings = await getCompanySettings();
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawBranch = Array.isArray(params.branch) ? params.branch[0] : params.branch;
  const selectedBranch: BranchId = rawBranch && isBranchId(rawBranch) ? rawBranch : DEFAULT_BRANCH_ID;
  const companyName = companySettings.companyName?.trim() || "Empresa";
  const errorText =
    rawError === "invalid"
      ? "Credenciales inválidas."
      : rawError === "missing"
        ? "Debes completar correo y contraseña."
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
          <select id="branch" name="branch" defaultValue={selectedBranch} required>
            {BRANCHES.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.label}
              </option>
            ))}
          </select>
          <button className="primary-btn" type="submit">
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
