import type { Role } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/reservas", label: "Reservas", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/contratos", label: "Contratos", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/vehiculos", label: "Vehículos", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/clientes", label: "Clientes", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/facturacion", label: "Facturación", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
  { href: "/gestor", label: "Gestor", roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/ayuda", label: "Ayuda", roles: ["SUPER_ADMIN", "ADMIN", "LECTOR"] },
];

// Filtra navegación por rol para no exponer módulos no autorizados en UI.
export function getNavForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
