"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "ls-theme";

/**
 * Inline script (string) run before paint in <head> to set the resolved theme on
 * <html> so there's no flash of the wrong palette. Mirrors resolve() below.
 * First-time visitors (no saved preference) land on dark — only an explicit
 * "system" choice falls back to following the OS preference.
 */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(m==='light'||m==='dark')?m:(m==='system'?(d?'dark':'light'):'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

type Ctx = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** The actually-applied palette (system resolved to light/dark). */
  resolved: "light" | "dark";
};

const ThemeContext = createContext<Ctx | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Apply a mode to the <html> element. System mode is resolved to an explicit
 * light/dark data-theme (rather than removing the attr) so the light-only
 * component overrides apply the same in system-light as in manual light.
 */
function apply(mode: ThemeMode) {
  const effective =
    mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-theme", effective);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  // Default for first-time visitors is dark (mirrors themeInitScript below) —
  // "system" is only used once a visitor explicitly picks it via the toggle.
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // Hydrate the saved preference once on mount.
  useEffect(() => {
    let initial: ThemeMode = "dark";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        initial = saved;
      }
    } catch {
      // ignore
    }
    setModeState(initial);
  }, []);

  // Apply the mode and keep `resolved` in sync, including live OS changes while
  // in system mode.
  useEffect(() => {
    apply(mode);
    const compute = () =>
      setResolved(
        mode === "dark" || (mode === "system" && systemPrefersDark())
          ? "dark"
          : "light",
      );
    compute();
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      apply(mode); // re-resolve the explicit data-theme on OS change
      compute();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
