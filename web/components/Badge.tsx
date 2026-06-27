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
        color: live ? "var(--green)" : "var(--muted)",
        border: `1px solid ${live ? "var(--green)" : "var(--hairline)"}`,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {live ? (
        <span className="live-dot" />
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            background: "var(--faint)",
          }}
        />
      )}
      {live ? "LIVE" : "ENDED"}
    </span>
  );
}
