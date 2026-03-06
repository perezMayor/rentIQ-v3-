"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  // Cierra sesión en backend y fuerza navegación limpia al login.
  const onLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <button className="secondary-btn sidebar-logout-btn" onClick={onLogout}>
      Cerrar sesión
    </button>
  );
}
