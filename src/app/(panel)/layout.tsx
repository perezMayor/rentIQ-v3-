import { redirect } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { getNavForRole } from "@/lib/navigation";
import { getSelectedBranchId, getSessionUser } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Protección de layout: todo el panel requiere sesión.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const selectedBranch = await getSelectedBranchId();
  const navItems = getNavForRole(user.role);

  return (
    <AppLayout
      userName={user.name}
      userRole={user.role}
      branches={BRANCHES}
      selectedBranch={selectedBranch}
      navItems={navItems}
    >
      {children}
    </AppLayout>
  );
}
