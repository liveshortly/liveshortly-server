import type { Session } from "@/lib/api";
import { sessionState } from "@/lib/sessionState";

/**
 * Status badge — the status dot with its name next to it.
 *
 * It used to know two states (LIVE / ENDED) while SessionStatusDot knew four,
 * so a published session showed a blue dot in the sidebar and the word ENDED
 * in its own header. Both now read lib/sessionState, and the badge draws the
 * same .ws-status-dot shapes, so the two cannot drift apart again.
 *
 * A caller that only has a status still works: visibility and published_at are
 * optional, and their absence simply means live-or-ended.
 */
export default function Badge({
  s,
  size = "sm",
}: {
  s: Pick<Session, "status" | "visibility" | "published_at">;
  size?: "sm" | "md";
}) {
  const { state, display } = sessionState(s);
  const color =
    state === "live"
      ? "var(--green)"
      : state === "published"
        ? "var(--blue)"
        : state === "shared"
          ? "var(--amber)"
          : "var(--muted)";
  return (
    <span
      className="label tnum"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: size === "md" ? "var(--text-sm)" : "var(--text-xs)",
        fontWeight: 700,
        color,
        border: `1px solid ${state === "ended" ? "var(--hairline)" : color}`,
        background:
          state === "ended"
            ? "transparent"
            : `color-mix(in srgb, ${color} 10%, transparent)`,
        borderRadius: "var(--radius-pill)",
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <span className={`ws-status-dot ws-status-dot-inline ws-status-dot-${state}`}
        aria-hidden="true" />
      {display}
    </span>
  );
}
