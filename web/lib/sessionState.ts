import type { Session } from "@/lib/api";

/**
 * The one place a session's visible state is decided.
 *
 * Badge and SessionStatusDot used to answer this separately and disagree:
 * the dot knew four states (live / published / shared / ended) while the badge
 * knew two (LIVE / ENDED), so the same session read differently in the sidebar
 * and in its own header. Both now call this.
 *
 * Priority is live > published > shared > ended: a live session that is also
 * published is still, first, live.
 */
export type SessionState = "live" | "published" | "shared" | "ended";

export interface SessionStateInfo {
  state: SessionState;
  /** Lower-case, for title/aria-label. */
  label: string;
  /** Upper-case, for a badge face. */
  display: string;
}

const LABELS: Record<SessionState, string> = {
  live: "live",
  published: "published",
  shared: "shared",
  ended: "ended",
};

/**
 * `shared` and `live` override what the record says — a caller that already
 * knows better (an SSE frame saying the agent is still attached, a list that
 * resolved share grants) passes them in.
 */
export function sessionState(
  s: Pick<Session, "status" | "visibility" | "published_at">,
  opts?: { shared?: boolean; live?: boolean },
): SessionStateInfo {
  const state: SessionState =
    opts?.live || s.status === "live"
      ? "live"
      : s.published_at
        ? "published"
        : opts?.shared ||
            s.visibility === "link" ||
            s.visibility === "public" ||
            s.visibility === "open"
          ? "shared"
          : "ended";
  return { state, label: LABELS[state], display: LABELS[state].toUpperCase() };
}
