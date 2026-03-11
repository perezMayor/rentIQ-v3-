import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { requestUserPasswordRecovery } from "@/lib/services/rental-service";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function LoginRecoveryPage({ searchParams }: Props) {
  const session = await getSessionUser();
  if (session) redirect("/dashboard");

  const params = await Promise.resolve(searchParams ?? {});
  const rawOk = Array.isArray(params.ok) ? params.ok[0] : params.ok;

  async function requestRecoveryAction(formData: FormData) {
    "use server";
    await requestUserPasswordRecovery(String(formData.get("email") ?? ""));
    redirect("/login/recuperar?ok=1");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="stack-md">
          <h2>Recuperar acceso</h2>
          <p className="muted-text">
            Registra la solicitud con el correo del usuario. La recuperación queda trazada para gestión interna.
          </p>
          {rawOk === "1" ? <p>Solicitud registrada.</p> : null}
          <form action={requestRecoveryAction} className="stack-md">
            <label htmlFor="email">Correo del usuario</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <button className="primary-btn" type="submit">Solicitar recuperación</button>
          </form>
          <Link href="/login" className="text-center muted-text">
            Volver al login
          </Link>
        </div>
      </section>
    </main>
  );
}
