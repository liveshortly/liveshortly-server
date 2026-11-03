import type { ReactElement } from "react";
import { sessionTitle, type Session } from "@/lib/api";
import { shareSafe } from "@/lib/transcript";

/** Shared 1200×630 Open Graph / Twitter card (LSW-37). Dark Mac-app look from
 *  the tokens.css dark palette, Inter for everything but the code peek
 *  (JetBrains Mono), and a faint agent-keyed glow so cards are recognisable in
 *  a feed. One static image serves every viewer, so it can't follow the
 *  viewer's theme; dark stands out on X. Text passed in must already be safe to
 *  publish (see shareSafe in lib/transcript.ts). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// tokens.css :root[data-theme="dark"]
const C = {
  canvas: "#121110",
  sunken: "#0c0b0a",
  hairline: "#2e2c27",
  fg: "#ebe8e0",
  fg2: "#a8a399",
  fg3: "#8e8a81",
  accent: "#3db27e",
  bad: "#d76e5a",
};

/** Agent accent for the glow and the agent dot. */
function agentColor(fw: string | null | undefined): string {
  switch (fw) {
    case "claude-code":
      return "#d97757";
    case "gemini-cli":
      return "#4f8df5";
    case "agy":
    case "antigravity":
      return C.accent;
    default:
      return C.fg3; // Codex and the rest: neutral
  }
}

const SANS = "Inter";
const MONO = "JetBrains Mono";

function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={C.accent} />
      <rect x="7" y="8.5" width="6.5" height="15" rx="1.5" fill={C.canvas} />
      <rect
        x="16.5"
        y="8.5"
        width="8.5"
        height="15"
        rx="1.5"
        fill={C.accent}
        stroke={C.canvas}
        strokeWidth="2"
      />
    </svg>
  );
}

export type OgCardProps = {
  title: string;
  status?: "live" | "ended" | null;
  framework?: string | null; // raw framework id, keys the accent
  agent?: string | null; // display name, e.g. "Claude Code"
  model?: string | null;
  excerpt?: string | null;
  edit?: { file: string; add: number; del: number } | null;
  /** Footer facts, already formatted ("@rohit", "1h 12m", "88 events"…). */
  meta?: string[];
};

/** A session's title as shown on share cards and og:title — never markup
 *  (a prompt-derived title can be a raw <task-notification>). */
export const shareTitle = (s: Pick<Session, "title" | "suggested_title">) =>
  shareSafe(sessionTitle(s), 1) ?? "A coding session";

/** The generic brand card: site default, and any session that isn't open
 *  (private, deleted, API down) — nothing about the session leaks. */
export const SITE_CARD: OgCardProps = {
  title: "Watch coding agents work, live",
  excerpt:
    "Stream Claude Code, Codex, Gemini and Antigravity sessions as they happen. Replay them, share them, hand them off.",
  framework: "agy",
};

export function ogCard(o: OgCardProps): ReactElement {
  const live = o.status === "live";
  const tint = agentColor(o.framework);
  const agentLine = [o.agent, o.model].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "56px 64px 48px",
        color: C.fg,
        fontFamily: SANS,
        backgroundColor: C.canvas,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${tint}55 0%, ${tint}18 40%, ${C.canvas}00 70%)`,
      }}
    >
      {/* Top row: mark (once) · status pill · agent + model */}
      <div style={{ display: "flex", alignItems: "center", height: 44 }}>
        <BrandMark size={40} />
        <div style={{ fontSize: 28, fontWeight: 600, marginLeft: 14, letterSpacing: -0.3 }}>
          LiveShortly
        </div>
        {o.status && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginLeft: 22,
              padding: "6px 16px",
              borderRadius: 999,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: 1.5,
              color: live ? C.accent : C.fg2,
              backgroundColor: live ? `${C.accent}22` : `${C.fg3}22`,
            }}
          >
            {live && (
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: C.accent,
                  marginRight: 10,
                }}
              />
            )}
            {live ? "LIVE" : "ENDED"}
          </div>
        )}
        <div style={{ display: "flex", flex: 1 }} />
        {agentLine && (
          <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: C.fg2 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                backgroundColor: tint,
                marginRight: 12,
              }}
            />
            {agentLine}
          </div>
        )}
      </div>

      {/* Hero title: up to 2 lines, then ellipsis */}
      <div
        style={{
          display: "block",
          marginTop: 52,
          fontSize: 62,
          fontWeight: 600,
          lineHeight: 1.12,
          letterSpacing: -1.2,
          lineClamp: 2,
        }}
      >
        {o.title}
      </div>

      {o.excerpt && (
        <div
          style={{
            display: "block",
            marginTop: 26,
            fontSize: 28,
            lineHeight: 1.42,
            color: C.fg2,
            lineClamp: o.edit ? 2 : 3,
          }}
        >
          {o.excerpt}
        </div>
      )}

      {o.edit && (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            alignItems: "center",
            marginTop: 26,
            padding: "10px 18px",
            borderRadius: 10,
            border: `1px solid ${C.hairline}`,
            backgroundColor: C.sunken,
            fontFamily: MONO,
            fontSize: 22,
          }}
        >
          <div style={{ color: C.fg }}>{o.edit.file}</div>
          {o.edit.add > 0 && (
            <div style={{ color: C.accent, marginLeft: 18 }}>{`+${o.edit.add}`}</div>
          )}
          {o.edit.del > 0 && (
            <div style={{ color: C.bad, marginLeft: 10 }}>{`-${o.edit.del}`}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }} />

      {/* Footer: facts · call to action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingTop: 22,
          borderTop: `1px solid ${C.hairline}`,
          fontSize: 24,
          color: C.fg2,
        }}
      >
        <div style={{ display: "flex" }}>{(o.meta ?? []).join("  ·  ")}</div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", color: C.fg }}>
          {"watch on "}
          <span style={{ color: C.accent, marginLeft: 7 }}>liveshortly.com</span>
        </div>
      </div>
    </div>
  );
}
