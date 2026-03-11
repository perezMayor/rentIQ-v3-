import { redirect } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { getNavForRole } from "@/lib/navigation";
import { getSelectedBranchId, getSessionUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/services/rental-service";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const settings = await getCompanySettings();
  const branches = settings.branches.toSorted((a, b) => a.id - b.id || a.code.localeCompare(b.code)).map((branch) => ({
    id: branch.code.trim().toUpperCase(),
    label: `${branch.code} · ${branch.name}`,
  }));
  const selectedBranch = await getSelectedBranchId();
  const navItems = getNavForRole(user.role);

  return (
    <AppLayout
      userName={user.name}
      userRole={user.role}
      branches={branches}
      selectedBranch={branches.some((item) => item.id === selectedBranch) ? selectedBranch : branches[0]?.id ?? ""}
      navItems={navItems}
    >
      {children}
    </AppLayout>
  );
}
