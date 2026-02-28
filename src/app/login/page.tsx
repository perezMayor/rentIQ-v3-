import { redirect } from "next/navigation";
import { getSessionUser, ROLES } from "@/lib/auth";

export default async function LoginPage() {
  // Si ya existe sesión, no debe mostrarse formulario de login.
  const session = await getSessionUser();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>RentIQ Gestión</h1>
        {/* Login simplificado por selección de rol para entorno demo/controlado. */}
        <p className="muted-text">Acceso de empleados por rol (modo base Iteración 1).</p>
        <form action="/api/login" method="POST" className="stack-md">
          <label htmlFor="role">Rol</label>
          <select name="role" id="role" defaultValue="ADMIN">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
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
