import type { ReactNode } from "react";

/** Boxed HUD panel: uppercase label top-left, large value below. */
export default function Panel({
  label,
  value,
  hint,
  accent,
  children,
  className,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  accent?: "green" | "red" | "amber" | "ink";
  children?: ReactNode;
  className?: string;
}) {
  const color =
    accent === "green"
      ? "var(--green)"
      : accent === "red"
        ? "var(--red)"
        : accent === "amber"
          ? "var(--amber)"
          : "var(--ink)";
  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "10px 12px",
        minWidth: 0,
      }}
    >
      <div className="label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      {value != null && (
        <div
          className="tnum"
          style={{
            fontSize: 26,
            lineHeight: 1.05,
            fontWeight: 600,
            color,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
      )}
      {children}
      {hint != null && (
        <div className="label" style={{ marginTop: 4, color: "var(--faint)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
