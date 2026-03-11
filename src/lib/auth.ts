import { cookies } from "next/headers";
import { DEFAULT_BRANCH_ID, normalizeBranchId, type BranchId } from "@/lib/branches";
import { readRentalData } from "@/lib/services/rental-store";
import type { UserAccount } from "@/lib/domain/rental";

// Nombre de cookie exclusivo de la V3 para evitar colisiones con otras apps/entornos.
export const SESSION_COOKIE = "rq_v3_session";
export const BRANCH_COOKIE = "rq_v3_branch";

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

const DEMO_PASSWORDS: Record<Role, string> = {
  SUPER_ADMIN: "SuperAdmin#2026",
  ADMIN: "Admin#2026",
  LECTOR: "Lector#2026",
};

// Resuelve un usuario demo por correo para login con permisos asociados al email.
export function getDemoUserByEmail(emailRaw: string): SessionUser | null {
  const email = emailRaw.trim().toLowerCase();
  const exact = Object.values(DEMO_USERS).find((item) => item.email.toLowerCase() === email);
  if (exact) {
    return exact;
  }

  const [localPart] = email.split("@");
  if (!localPart) {
    return null;
  }

  if (localPart === "superadmin") {
    return DEMO_USERS.SUPER_ADMIN;
  }
  if (localPart === "admin") {
    return DEMO_USERS.ADMIN;
  }
  if (localPart === "lector") {
    return DEMO_USERS.LECTOR;
  }

  return null;
}

export function validateDemoCredentials(emailRaw: string, passwordRaw: string): SessionUser | null {
  const user = getDemoUserByEmail(emailRaw);
  if (!user) {
    return null;
  }
  const expectedPassword = DEMO_PASSWORDS[user.role];
  return passwordRaw === expectedPassword ? user : null;
}

function mapUserAccountToSession(user: UserAccount): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function validateCredentials(emailRaw: string, passwordRaw: string): Promise<SessionUser | null> {
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw.trim();
  if (!email || !password) return null;

  const data = await readRentalData();
  const account = data.users.find((item) => item.active && item.email.trim().toLowerCase() === email && item.password === password);
  if (account) {
    return mapUserAccountToSession(account);
  }

  return validateDemoCredentials(emailRaw, passwordRaw);
}

// Lee cookie de sesión y la traduce a usuario de la tabla en memoria.
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const data = await readRentalData();
  const account = data.users.find((item) => item.id === raw && item.active);
  if (account) {
    return mapUserAccountToSession(account);
  }

  const demoUser = Object.values(DEMO_USERS).find((item) => item.id === raw);
  return demoUser ?? null;
}

export async function getSelectedBranchId(): Promise<BranchId> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(BRANCH_COOKIE)?.value;
  const normalized = normalizeBranchId(raw ?? "");
  if (normalized) {
    return normalized;
  }
  return DEFAULT_BRANCH_ID;
}

// Guardia de autenticación para acciones/rutas que requieren sesión obligatoria.
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("NO_AUTH");
  }
  return user;
}
