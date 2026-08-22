import { createContext, startTransition, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "rpm.theme";
const DEFAULT: Theme = "dark";

/**
 * Pre-hydration script. Runs before React mounts so the correct class is on
 * <html> before first paint (avoids a dark→light flash for users who chose
 * light). Default is dark: only remove the class if the user explicitly opted
 * into light mode.
 */
export const themeInitScript = `
try {
  var t = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  var d = document.documentElement;
  if (t === "light") { d.classList.remove("dark"); }
  else { d.classList.add("dark"); }
} catch (e) {}
`;

type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT);

  // Sync initial state from what the pre-hydration script already set.
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setThemeState(isDark ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    // Defer React state so the html class swap stays responsive (INP).
    const d = document.documentElement;
    if (next === "dark") d.classList.add("dark");
    else d.classList.remove("dark");
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    startTransition(() => setThemeState(next));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
