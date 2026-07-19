"use client";

import { useTheme, type ThemeMode } from "@/components/ThemeProvider";

const ORDER: ThemeMode[] = ["system", "light", "dark"];
const GLYPH: Record<ThemeMode, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};
const NEXT_LABEL: Record<ThemeMode, string> = {
  system: "LIGHT",
  light: "DARK",
  dark: "SYSTEM",
};

/** Icon-only theme switcher — click cycles system → light → dark. */
export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className="v3-icon-btn"
      aria-label={`Theme: ${mode}. Switch to ${NEXT_LABEL[mode].toLowerCase()}.`}
      title={`Theme: ${mode} — click for ${NEXT_LABEL[mode].toLowerCase()}`}
      style={{ background: "transparent", cursor: "pointer" }}
    >
      <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>
        {GLYPH[mode]}
      </span>
    </button>
  );
}
