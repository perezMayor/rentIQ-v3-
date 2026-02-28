import { cookies } from "next/headers";

// Nombre de cookie exclusivo de la V3 para evitar colisiones con otras apps/entornos.
export const SESSION_COOKIE = "rq_v3_session";

export const ROLES = ["SUPER_ADMIN", "ADMIN", "LECTOR"] as const;
export type Role = (typeof ROLES)[number];

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const DEMO_USERS: Record<Role, SessionUser> = {
  SUPER_ADMIN: {
    id: "u-super-admin",
    name: "Super Admin",
    email: "superadmin@rentiq.local",
    role: "SUPER_ADMIN",
  },
  ADMIN: {
    id: "u-admin",
    name: "Admin Operativo",
    email: "admin@rentiq.local",
    role: "ADMIN",
  },
  LECTOR: {
    id: "u-lector",
    name: "Lector",
    email: "lector@rentiq.local",
    role: "LECTOR",
  },
};

// Resuelve un usuario demo a partir del rol recibido en login.
export function getDemoUserByRole(role: Role): SessionUser {
  return DEMO_USERS[role];
}

// Lee cookie de sesión y la traduce a usuario de la tabla en memoria.
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const user = Object.values(DEMO_USERS).find((item) => item.id === raw);
  return user ?? null;
}

// Guardia de autenticación para acciones/rutas que requieren sesión obligatoria.
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("NO_AUTH");
  }
  return user;
}
