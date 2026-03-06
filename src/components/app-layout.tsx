"use client";
// Componente de UI: app-layout.

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MainLayoutFrame } from "@/components/main-layout-frame";
import { LogoutButton } from "@/components/logout-button";
import { useTheme } from "@/components/theme-provider";
import type { BranchId } from "@/lib/branches";

type AppNavItem = {
  href: string;
  label: string;
};

type Props = {
  userName: string;
  userRole: string;
  branches: ReadonlyArray<{ id: BranchId; label: string }>;
  selectedBranch: BranchId;
  navItems: AppNavItem[];
  children: React.ReactNode;
};

export function AppLayout({
  userName,
  userRole,
  branches,
  selectedBranch,
  navItems,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { themeSetting, setThemeSetting } = useTheme();
  const [isPending, startTransition] = useTransition();
  const [branch, setBranch] = useState<BranchId>(selectedBranch);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userDisplay = userName.trim() ? userName : userRole;
  const selectedBranchLabel = branches.find((item) => item.id === branch)?.label ?? "Sucursal";
  const hideContentPanel = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  async function onBranchChange(next: BranchId) {
    setMobileMenuOpen(false);
    setBranch(next);
    await fetch("/api/session/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: next }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={`app-layout app-layout-root ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
      <aside className={`sidebar sidebar-fixed ${mobileMenuOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-block">
            <Image src="/brand/logo_RIQ_compl_osc_pq.png" className="brand-logo brand-logo-sidebar" alt="RentIQ" width={176} height={66} priority />
          </div>
          <nav className="nav-list" aria-label="Navegación principal">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${active ? " active" : ""}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="sidebar-bottom stack-sm">
          <div className="stack-sm" role="group" aria-label="Controles de sesión">
            <label
              className="toolbar-chip toolbar-chip-select"
              aria-label="Selector de sucursal"
              style={{
                height: 32,
                borderRadius: 10,
                border: "1px solid rgba(243, 244, 246, 0.28)",
                background: "transparent",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 8px",
                width: "100%",
                color: "var(--color-sidebar-text)",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: "var(--color-sidebar-text)",
                  pointerEvents: "none",
                }}
              >
                {selectedBranchLabel}
              </span>
              <select
                value={branch}
                onChange={(event) => onBranchChange(event.target.value as BranchId)}
                className="chip-select"
                disabled={isPending}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  outline: "none",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="toolbar-chip toolbar-chip-user"
              style={{
                height: 32,
                borderRadius: 10,
                border: "1px solid rgba(243, 244, 246, 0.28)",
                background: "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                minWidth: 0,
                maxWidth: "none",
                padding: "0 10px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--color-sidebar-text)",
              }}
            >
              <strong style={{ fontSize: 12, lineHeight: 1, color: "var(--color-sidebar-text)" }}>{userDisplay}</strong>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <button
        type="button"
        className="sidebar-hamburger"
        aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {mobileMenuOpen ? "✕" : "☰"}
      </button>
      {mobileMenuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileMenuOpen(false)} /> : null}

      <div className="main-area">
        <main className="content-area">
          <MainLayoutFrame
            showContentPanel={!hideContentPanel}
          >
            {children}
          </MainLayoutFrame>
          <p className="watermark-caption" aria-hidden="true">
            RentIQ: Software de gestión para Rent a Car
          </p>
        </main>
        <div className="theme-switcher">
          <button
            type="button"
            className="theme-letter active"
            onClick={() => {
              if (themeSetting === "system") {
                setThemeSetting("light");
                return;
              }
              if (themeSetting === "light") {
                setThemeSetting("dark");
                return;
              }
              setThemeSetting("system");
            }}
            title={
              themeSetting === "system"
                ? "Tema: Auto"
                : themeSetting === "light"
                  ? "Tema: Claro"
                  : "Tema: Oscuro"
            }
            aria-label="Cambiar tema"
          >
            {themeSetting === "system" ? "A" : themeSetting === "light" ? "C" : "O"}
          </button>
        </div>
      </div>
    </div>
  );
}
