import type { SessionStatus } from "@/lib/api";

/** Status badge. LIVE = green pulsing dot; ENDED = muted square. */
export default function Badge({
  status,
  size = "sm",
}: {
  status: SessionStatus;
  size?: "sm" | "md";
}) {
  const live = status === "live";
  const fs = size === "md" ? 12 : 11;
  return (
    <span
      className="label tnum"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: fs,
        fontWeight: 700,
        color: live ? "var(--green)" : "var(--muted)",
        border: `1px solid ${live ? "var(--green-line)" : "var(--hairline)"}`,
        background: live ? "var(--green-tint)" : "transparent",
        borderRadius: 999,
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {live ? (
        <span className="live-dot" />
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--faint)",
          }}
        />
      )}
      {live ? "LIVE" : "ENDED"}
    </span>
  );
}
