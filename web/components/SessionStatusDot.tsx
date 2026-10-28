import type { Session } from "@/lib/api";
import { sessionState } from "@/lib/sessionState";

/**
 * Shared session status dot (sidebar rows, HUD rows, …).
 *
 * The state itself comes from lib/sessionState, which Badge also uses, so the
 * dot and the badge cannot disagree about the same session. The four states
 * differ by shape as well as hue — see .ws-status-dot in globals.css.
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
  const { state, label } = sessionState(s, { shared, live });
  return (
    <span
      className={`ws-status-dot ws-status-dot-${state}`}
      title={label}
      aria-label={label}
    />
  );
}
