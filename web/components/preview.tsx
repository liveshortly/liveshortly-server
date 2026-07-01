"use client";

import Link from "next/link";

/**
 * Shared building blocks for the "preview" screens (Profile, Replay, Dev Story,
 * Blog Composer). These screens implement the new design's layout but the data
 * behind several panels does not exist in the backend yet — so those panels
 * render an honest PlaceholderNote ("coming soon"), never fabricated data.
 */

/** A small ribbon marking a screen/panel as a design preview (no live data). */
export function PreviewBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="label"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid var(--amber)",
        background: "var(--panel)",
        color: "var(--amber)",
        padding: "8px 12px",
        marginBottom: 18,
      }}
    >
      <span aria-hidden>◐</span>
      <span>PREVIEW</span>
      <span style={{ color: "var(--muted)" }}>· {children}</span>
    </div>
  );
}

/** A titled panel box. `right` renders in the header (e.g. a count or control). */
export function PanelBox({
  title,
  right,
  children,
  pad = true,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
      }}
    >
      {title && (
        <div
          className="label dashed-b"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            color: "var(--ink)",
          }}
        >
          <span>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: pad ? "14px 12px" : 0 }}>{children}</div>
    </section>
  );
}

/** Honest empty state for a panel whose backing data does not exist yet. */
export function PlaceholderNote({
  label = "NO DATA YET",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--hairline)",
        background: "var(--bg)",
        padding: "22px 16px",
        textAlign: "center",
      }}
    >
      <div className="label" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {children && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--faint)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Page heading with an optional back link. */
export function PageHead({
  eyebrow,
  title,
  sub,
  back,
}: {
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      {back && (
        <Link
          href={back.href}
          className="label"
          style={{ color: "var(--muted)", display: "inline-block", marginBottom: 10 }}
        >
          ◂ {back.label}
        </Link>
      )}
      {eyebrow && (
        <div className="label" style={{ color: "var(--green)" }}>
          {eyebrow}
        </div>
      )}
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.2,
          margin: "8px 0 0",
          color: "var(--ink)",
        }}
      >
        {title}
      </h1>
      {sub && (
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** A compact labelled stat. */
export function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="tnum"
        style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}
      >
        {value}
      </div>
      <div className="label" style={{ marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
