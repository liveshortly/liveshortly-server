import type { ReactElement } from "react";

/** Shared 1200×630 Open Graph / Twitter card renderer. Renders the app's actual
 *  session-card look (terminal-HUD, light theme, JetBrains Mono) so a shared
 *  link previews like a real LiveShortly card — with genuine session text.
 *
 *  Only glyphs present in JetBrains Mono are used (ASCII + middle dot); Satori
 *  can't fetch fallback fonts for exotic glyphs (▪●◔⚙›) at render time.
 *
 *  OG images are static (one image served to every crawler/viewer), so they
 *  can't follow each viewer's system theme; we match the app's default (light)
 *  palette, which is what the card looks like out of the box. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// App light-theme palette (mirrors globals.css :root).
const C = {
  bg: "#e7e8ea",
  panel: "#f3f4f5",
  hairline: "#d0d2d5",
  ink: "#1b1c1e",
  muted: "#63666b",
  faint: "#94979c",
  green: "#1f7a4d",
};

export function ogCard(o: {
  title: string;
  status?: "live" | "ended" | null;
  model?: string | null;
  shortId?: string;
  snippet?: string | null; // hero snippet
  highlight?: string | null; // a real line from the session (prompt/response)
  owner?: string | null;
  age?: string | null;
  events?: number;
  views?: number;
  published?: boolean;
  subtitle?: string | null; // used by the site-default card
}): ReactElement {
  const live = o.status === "live";
  const font = "JetBrains Mono, monospace";
  const snippet = o.snippet || o.subtitle;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.ink,
        padding: 56,
        fontFamily: font,
      }}
    >
      {/* Brand strip */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{ width: 30, height: 30, background: C.green, borderRadius: 7 }}
        />
        <div style={{ fontSize: 26, fontWeight: 700, marginLeft: 14 }}>
          LiveShortly
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ fontSize: 22, color: C.muted }}>liveshortly.com</div>
      </div>

      {/* The session card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          marginTop: 26,
          border: `1px solid ${C.hairline}`,
          background: C.panel,
        }}
      >
        {/* Header: status badge + model (only for real sessions) */}
        {(o.status != null || o.model) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 26px",
              borderBottom: `1px solid ${C.hairline}`,
            }}
          >
            {o.status != null ? (
              <div
                style={{
                  display: "flex",
                  border: `1px solid ${live ? C.green : C.faint}`,
                  color: live ? C.green : C.muted,
                  padding: "6px 16px",
                  fontSize: 22,
                  letterSpacing: 3,
                }}
              >
                {live ? "LIVE" : "ENDED"}
              </div>
            ) : (
              <div style={{ display: "flex" }} />
            )}
            {o.model && (
              <div style={{ fontSize: 24, color: C.muted, letterSpacing: 1 }}>
                {o.model.toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Body: short id, title, snippet, session highlight */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "26px 30px",
          }}
        >
          {o.shortId && (
            <div style={{ fontSize: 22, color: C.faint, letterSpacing: 3 }}>
              {o.shortId}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              color: C.ink,
              marginTop: 8,
              lineHeight: 1.1,
              maxHeight: 132,
              overflow: "hidden",
            }}
          >
            {o.title}
          </div>

          {snippet && (
            <div style={{ display: "flex", marginTop: 22, fontSize: 26 }}>
              <div style={{ color: C.green, marginRight: 12 }}>{">"}</div>
              <div style={{ color: C.muted }}>{snippet}</div>
            </div>
          )}

          {o.highlight && (
            <div
              style={{
                display: "flex",
                marginTop: 22,
                paddingLeft: 16,
                borderLeft: `3px solid ${C.green}`,
                fontSize: 24,
                color: C.muted,
                lineHeight: 1.4,
                maxHeight: 108,
                overflow: "hidden",
              }}
            >
              {o.highlight}
            </div>
          )}
        </div>

        {/* Footer: owner · age · stats + published chip. Only when the card has
            session metadata (the site-default card omits it). */}
        {(o.owner || o.events != null) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "18px 26px",
              borderTop: `1px solid ${C.hairline}`,
              fontSize: 24,
            }}
          >
            {o.owner && <div style={{ display: "flex", color: C.ink }}>{`@${o.owner}`}</div>}
            {o.age && (
              <div style={{ display: "flex", color: C.faint, marginLeft: 16 }}>
                {`· ${o.age}`}
              </div>
            )}
            <div style={{ display: "flex", flex: 1 }} />
            {o.published && (
              <div
                style={{
                  display: "flex",
                  border: `1px solid ${C.green}`,
                  color: C.green,
                  padding: "5px 12px",
                  fontSize: 20,
                  letterSpacing: 2,
                  marginRight: 18,
                }}
              >
                PUBLISHED
              </div>
            )}
            {o.events != null && (
              <div style={{ display: "flex", color: C.muted }}>
                {`${fmt(o.events)} EVENTS   ${fmt(o.views)} VIEWS`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-US");
}
