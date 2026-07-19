"use client";

import { useEffect, useRef, useState } from "react";
import ConfirmPopover from "@/components/ConfirmPopover";
import {
  enableOpenLink,
  isPublished,
  publishSession,
  unpublishSession,
  type Session,
} from "@/lib/api";

/**
 * Owner-only Publish / Unpublish control.
 *
 * Publish opens a small popover to choose the reach — "anyone signed in"
 * (visibility public) or "anyone, no sign-in" (visibility open) — then a final
 * Publish button performs it. Once published the control flips to a red
 * UNPUBLISH that needs a second click to confirm before it unpublishes.
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
  const [open, setOpen] = useState(false); // publish-choice popover
  const [choice, setChoice] = useState<"public" | "open">("public");
  const wrapRef = useRef<HTMLSpanElement>(null);
  const published = isPublished(session);

  // Dismiss the publish-choice popover on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const doPublish = async () => {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      let updated = await publishSession(session.id);
      // "Without sign-in" also opens the link to anonymous visitors.
      if (choice === "open") updated = await enableOpenLink(session.id);
      onChanged(updated);
      setOpen(false);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  // ── Published → red UNPUBLISH, confirmed in a popover. ──
  if (published) {
    return (
      <ConfirmPopover
        label="● UNPUBLISH"
        triggerTitle="Published — click to unpublish"
        message="Unpublish this session? It will be removed from the public feed."
        confirmLabel="Unpublish"
        busyLabel="Unpublishing…"
        onConfirm={async () => {
          onChanged(await unpublishSession(session.id));
        }}
      />
    );
  }

  // ── Not published → PUBLISH opens the reach-choice popover. ──
  return (
    <span ref={wrapRef} className="pub-wrap">
      <button
        type="button"
        className={`label${open ? " on" : ""}`}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        title="Publish to the public feed"
        style={{
          border: `1px solid ${err ? "var(--red)" : "var(--strong)"}`,
          background: open ? "var(--strong)" : "transparent",
          color: err ? "var(--red)" : open ? "var(--panel)" : "var(--ink)",
          padding: "5px 10px",
          fontSize: 10,
          cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {err ? "⚠ RETRY" : "⊕ PUBLISH"}
      </button>

      {open && (
        <div className="pub-pop" role="dialog" aria-label="Publish options">
          <div className="pub-pop-h">Publish to the feed</div>

          <label className="pub-opt">
            <input
              type="radio"
              name={`pubvis-${session.id}`}
              checked={choice === "public"}
              onChange={() => setChoice("public")}
            />
            <span className="pub-opt-body">
              <span className="pub-opt-t">Anyone signed in</span>
              <span className="pub-opt-sub">
                Discoverable in the feed · viewers must sign in
              </span>
            </span>
          </label>

          <label className="pub-opt">
            <input
              type="radio"
              name={`pubvis-${session.id}`}
              checked={choice === "open"}
              onChange={() => setChoice("open")}
            />
            <span className="pub-opt-body">
              <span className="pub-opt-t">Anyone, no sign-in</span>
              <span className="pub-opt-sub">
                Public link · anonymous visitors can watch
              </span>
            </span>
          </label>

          <button
            type="button"
            className="pub-pop-go"
            disabled={busy}
            onClick={doPublish}
          >
            {busy ? "PUBLISHING…" : "⊕ Publish"}
          </button>
        </div>
      )}
    </span>
  );
}
