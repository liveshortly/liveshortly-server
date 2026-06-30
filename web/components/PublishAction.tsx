"use client";

import { useState } from "react";
import {
  isPublished,
  publishSession,
  unpublishSession,
  type Session,
} from "@/lib/api";

/**
 * Owner-only Publish / Unpublish toggle. Publishing lists the session in the
 * public Feed (and makes it readable by any signed-in user); unpublishing makes
 * it private again. One click each way, with an optimistic-on-success update.
 */
export default function PublishAction({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: (s: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const published = isPublished(session);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const updated = published
        ? await unpublishSession(session.id)
        : await publishSession(session.id);
      onChanged(updated);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const accent = published ? "var(--green)" : "var(--strong)";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="label"
      title={
        published
          ? "Published to the feed — click to unpublish"
          : "Publish to the public feed"
      }
      style={{
        border: `1px solid ${err ? "var(--red)" : accent}`,
        background: published ? "transparent" : "transparent",
        color: err ? "var(--red)" : published ? "var(--green)" : "var(--ink)",
        padding: "5px 10px",
        fontSize: 10,
        cursor: busy ? "default" : "pointer",
        whiteSpace: "nowrap",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy
        ? published
          ? "UNPUBLISHING…"
          : "PUBLISHING…"
        : err
          ? "⚠ RETRY"
          : published
            ? "● PUBLISHED"
            : "⊕ PUBLISH"}
    </button>
  );
}
