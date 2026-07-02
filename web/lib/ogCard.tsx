import type { ReactElement } from "react";

/** Shared 1200×630 Open Graph / Twitter card renderer (used by the site default
 *  and per-session image routes). Terminal-HUD look in the app's dark palette —
 *  inline styles only (Satori/next-og constraints), no CSS vars, no web fonts. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const C = {
  bg: "#1e2123",
  panel: "#282c2f",
  hairline: "#3d4247",
  ink: "#e9ebed",
  muted: "#a6abb1",
  faint: "#797f86",
  green: "#54b885",
  amber: "#d9ad52",
};

export function ogCard(opts: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  status?: "live" | "ended" | null;
  stats?: { label: string; value: string }[];
}): ReactElement {
  const { title, subtitle, eyebrow, status, stats } = opts;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.ink,
        padding: 64,
        fontFamily: "monospace",
      }}
    >
      {/* Brand row */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: C.green,
            borderRadius: 9,
            display: "flex",
          }}
        />
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>
          LiveShortly
        </div>
        {status && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 10,
              padding: "5px 14px",
              borderRadius: 4,
              border: `1px solid ${status === "live" ? C.green : C.hairline}`,
              color: status === "live" ? C.green : C.muted,
              fontSize: 20,
              letterSpacing: 2,
            }}
          >
            {status === "live" ? "● LIVE" : "■ ENDED"}
          </div>
        )}
      </div>

      {eyebrow && (
        <div
          style={{
            marginTop: 44,
            color: C.green,
            fontSize: 22,
            letterSpacing: 4,
          }}
        >
          {eyebrow}
        </div>
      )}

      {/* Title */}
      <div
        style={{
          marginTop: 12,
          fontSize: 62,
          fontWeight: 700,
          lineHeight: 1.1,
          color: C.ink,
          // clamp to keep the card tidy for very long titles
          display: "flex",
          maxHeight: 220,
          overflow: "hidden",
        }}
      >
        {title}
      </div>

      {subtitle && (
        <div style={{ marginTop: 20, fontSize: 28, color: C.muted }}>
          {subtitle}
        </div>
      )}

      {/* Spacer */}
      <div style={{ display: "flex", flex: 1 }} />

      {/* Footer: stats + domain */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderTop: `1px solid ${C.hairline}`,
          paddingTop: 22,
        }}
      >
        <div style={{ display: "flex", gap: 44 }}>
          {(stats ?? []).map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: C.ink }}>
                {s.value}
              </div>
              <div style={{ fontSize: 20, color: C.faint, letterSpacing: 3 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, color: C.muted }}>liveshortly.com</div>
      </div>
    </div>
  );
}
