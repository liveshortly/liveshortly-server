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
 */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`;

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

/** Apply a mode to the <html> element (removing the attr for system mode). */
function apply(mode: ThemeMode) {
  const el = document.documentElement;
  if (mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Hydrate the saved preference once on mount.
  useEffect(() => {
    let initial: ThemeMode = "system";
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
    mq.addEventListener("change", compute);
    return () => mq.removeEventListener("change", compute);
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
