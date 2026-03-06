"use client";
// Componente de UI: theme-provider.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeSetting = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  themeSetting: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setThemeSetting: (theme: ThemeSetting) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_SETTING_STORAGE_KEY = "rentiq-theme-setting";

function resolveFromSystem(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveFromSystem());
  const resolvedTheme = themeSetting === "system" ? systemTheme : themeSetting;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setThemeSetting = useCallback(
    (next: ThemeSetting) => {
      setThemeSettingState(next);
      try {
        window.localStorage.setItem(THEME_SETTING_STORAGE_KEY, next);
      } catch {
        // noop
      }
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    if (themeSetting === "system") {
      setThemeSetting("dark");
      return;
    }
    if (themeSetting === "dark") {
      setThemeSetting("light");
      return;
    }
    setThemeSetting("system");
  }, [setThemeSetting, themeSetting]);

  const value = useMemo(
    () => ({ themeSetting, resolvedTheme, setThemeSetting, toggleTheme }),
    [themeSetting, resolvedTheme, setThemeSetting, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
