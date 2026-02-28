import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { MainLayoutFrame } from "@/components/main-layout-frame";
import { getNavForRole } from "@/lib/navigation";
import { getSessionUser } from "@/lib/auth";
import { listDeliveries, listPickups, listVehicleTaskAlerts } from "@/lib/services/rental-service";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Protección de layout: todo el panel requiere sesión.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const navItems = getNavForRole(user.role);
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  const toStr = to.toISOString().slice(0, 10);
  const deliveries = await listDeliveries({ from: `${from}T00:00:00`, to: `${toStr}T23:59:59`, branch: "" });
  const pickups = await listPickups({ from: `${from}T00:00:00`, to: `${toStr}T23:59:59`, branch: "" });
  const taskAlerts = await listVehicleTaskAlerts({ daysAhead: 7 });
  const deliveryCount = deliveries.withContract.length + deliveries.withoutContract.length;
  const pickupCount = pickups.withContract.length + pickups.withoutContract.length;

  return (
    <div className="app-shell">
      {/* Navegación lateral filtrada por rol. */}
      <aside className="sidebar" style={{ backgroundColor: "#0f2e4d", color: "#eef4fb" }}>
        <div>
          <h1 className="brand-title">RentIQ</h1>
          <p className="muted-text" style={{ color: "rgba(238, 244, 251, 0.86)" }}>Gestión operativa</p>
          <nav className="nav-list">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom stack-sm">
          <Link href="/configuracion" className="secondary-btn text-center">
            Configuración de la empresa
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="main-region">
        {/* Topbar contextual del usuario activo. */}
        <div className="topbar">
          <div>
            <strong>{user.name}</strong>
            <p className="muted-text">Rol: {user.role}</p>
          </div>
        </div>

        <MainLayoutFrame deliveryCount={deliveryCount} pickupCount={pickupCount} taskCount={taskAlerts.length}>
          {children}
        </MainLayoutFrame>

        <div className="watermark">RentIQ</div>
      </div>
    </div>
  );
}
