import type { Session } from "@/lib/api";

/**
 * Shared session status dot (sidebar rows, HUD rows, …).
 *   green (blinking) = live · blue = published · amber = shared · gray = ended.
 * Priority live > published > shared > ended.
 */
export default function SessionStatusDot({
  s,
  shared,
  live,
}: {
  s: Session;
  shared?: boolean;
  live?: boolean;
}) {
  const isLive = live || s.status === "live";
  const isShared =
    shared ||
    s.visibility === "link" ||
    s.visibility === "public" ||
    s.visibility === "open";

  let color = "var(--faint)";
  let label = "ended";
  if (s.published_at) {
    color = "var(--blue)";
    label = "published";
  } else if (isShared) {
    color = "var(--amber)";
    label = "shared";
  }

  return (
    <span
      className={`ws-status-dot${isLive ? " ws-status-dot-live" : ""}`}
      style={isLive ? undefined : { background: color }}
      title={isLive ? "live" : label}
      aria-label={isLive ? "live" : label}
    />
  );
}
