"use client";

import { useTheme, type ThemeMode } from "@/components/ThemeProvider";

const ORDER: ThemeMode[] = ["light", "dark", "system"];
const GLYPH: Record<ThemeMode, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};
const NEXT_LABEL: Record<ThemeMode, string> = {
  light: "DARK",
  dark: "SYSTEM",
  system: "LIGHT",
};

/** Compact theme switcher — click cycles light → dark → system. */
export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className="label"
      aria-label={`Theme: ${mode}. Switch to ${NEXT_LABEL[mode].toLowerCase()}.`}
      title={`Theme: ${mode} — click for ${NEXT_LABEL[mode].toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        padding: "5px 9px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
        {GLYPH[mode]}
      </span>
      {mode.toUpperCase()}
    </button>
  );
}
