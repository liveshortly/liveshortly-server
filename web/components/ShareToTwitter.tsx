"use client";

import { useState } from "react";
import {
  enableOpenLink,
  isOpenLink,
  publishSession,
  sessionViewUrl,
  type Session,
} from "@/lib/api";

/**
 * "Share to Twitter/X" action.
 *
 * Clicking it (per the Slice-1 spec):
 *  1. makes the session publicly viewable — sets visibility to "open" so ANYONE,
 *     including signed-out visitors who click the tweet, can watch it, and
 *     publishes it to the feed. Owner-only; if the caller isn't the owner we
 *     just share the link as-is.
 *  2. opens X/Twitter with a pre-populated tweet (title + author + link).
 *
 * The tweet window is opened synchronously on click (so it isn't popup-blocked),
 * and the visibility flip fires immediately — well before X's card crawler
 * fetches the link — so the shared page and its OG card resolve for everyone.
 */
export default function ShareToTwitter({
  session,
  onChanged,
  compact = false,
}: {
  session: Pick<
    Session,
    "id" | "title" | "owner_handle" | "visibility" | "link_role"
  > & { is_owner?: boolean };
  onChanged?: (s: Session) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const share = () => {
    const url = sessionViewUrl(session.id);
    const title = session.title?.trim() || "A LiveShortly session";
    const text = `${title} — by @${session.owner_handle}, live on LiveShortly`;
    const intent =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` +
      `&url=${encodeURIComponent(url)}&hashtags=LiveShortly,ClaudeCode`;

    // Open the composer first, in the click gesture, so it isn't popup-blocked.
    window.open(intent, "_blank", "noopener,noreferrer");

    // Make it public (owner only, and only if not already open to everyone).
    if (!session.is_owner || isOpenLink(session)) return;
    setBusy(true);
    setErr(false);
    (async () => {
      try {
        let updated = await enableOpenLink(session.id);
        try {
          updated = await publishSession(session.id);
        } catch {
          // Feed publish is best-effort; "open" already makes it viewable.
        }
        onChanged?.(updated);
      } catch {
        setErr(true);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="label"
      title={
        session.is_owner && !isOpenLink(session)
          ? "Make this session public and tweet it"
          : "Tweet a link to this session"
      }
      style={{
        border: "1px solid var(--strong)",
        background: "transparent",
        color: err ? "var(--red)" : "var(--ink)",
        padding: compact ? "4px 8px" : "5px 10px",
        fontSize: 10,
        cursor: busy ? "default" : "pointer",
        whiteSpace: "nowrap",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy
        ? "GOING PUBLIC…"
        : err
          ? "⚠ RETRY"
          : compact
            ? "𝕏 SHARE"
            : "𝕏 SHARE TO X"}
    </button>
  );
}
