"use client";

import { useState } from "react";
import Popover, { PopoverHeader } from "@/components/Popover";
import {
  disablePublicLink,
  enablePublicLink,
  sessionViewUrl,
  type Session,
} from "@/lib/api";

/**
 * Owner-only "share to all" popover. Confirms before opening a session's link
 * to anyone signed in (view-only), then shows the shareable URL with copy /
 * open actions and an END button to close the link again.
 *
 * `isPublic` is driven by the parent (the session's visibility) so the view
 * flips between the confirm step and the live-link step after each change.
 */
export default function PublicLinkDialog({
  sessionId,
  title,
  isPublic,
  anchorEl,
  onClose,
  onChanged,
}: {
  sessionId: string;
  title?: string;
  isPublic: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onChanged: (s: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = sessionViewUrl(sessionId);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await enablePublicLink(sessionId);
      onChanged(updated);
      // Pop the view-only page open for the owner to see immediately.
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    } catch {
      setErr("Could not enable the link — try again.");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await disablePublicLink(sessionId);
      onChanged(updated);
      onClose();
    } catch {
      setErr("Could not end sharing — try again.");
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setErr("Copy failed — select the link and copy manually.");
    }
  };

  return (
    <Popover anchorEl={anchorEl} onClose={onClose} ariaLabel="Share to all">
      <PopoverHeader title="SHARE TO ALL" onClose={onClose} />

      {title && (
        <div
          className="label"
          style={{
            color: "var(--muted)",
            marginBottom: 10,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textTransform: "none",
            letterSpacing: 0,
          }}
          title={title}
        >
          {title}
        </div>
      )}

      {!isPublic ? (
        <>
          <p
            style={{
              fontSize: 12,
              color: "var(--ink)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Anyone signed in with the link will be able to{" "}
            <strong>view</strong> this session — they can watch it live but
            cannot comment. You can end the link at any time.
          </p>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="label"
            style={{
              width: "100%",
              border: "1px solid var(--strong)",
              background: "var(--strong)",
              color: "var(--panel)",
              padding: "9px 10px",
              fontSize: 11,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "ENABLING…" : "⊕ CONFIRM · ENABLE LINK"}
          </button>
        </>
      ) : (
        <>
          <div
            className="label"
            style={{ color: "var(--green)", marginBottom: 8 }}
          >
            ● LINK IS LIVE · VIEW-ONLY
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Public link"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                border: "1px solid var(--hairline)",
                background: "var(--bg)",
                color: "var(--ink)",
                padding: "8px",
                fontSize: 11,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={copy}
              className="label"
              style={{
                border: "1px solid var(--strong)",
                background: copied ? "var(--green)" : "var(--strong)",
                color: "var(--panel)",
                padding: "0 10px",
                fontSize: 10,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ COPIED" : "COPY"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="label"
              style={{
                flex: 1,
                textAlign: "center",
                border: "1px solid var(--hairline)",
                color: "var(--ink)",
                padding: "8px 10px",
                fontSize: 10,
              }}
            >
              ↗ OPEN VIEW
            </a>
            <button
              type="button"
              onClick={end}
              disabled={busy}
              className="label"
              style={{
                flex: 1,
                border: "1px solid var(--red)",
                background: "transparent",
                color: "var(--red)",
                padding: "8px 10px",
                fontSize: 10,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "ENDING…" : "⊘ END SHARING"}
            </button>
          </div>
        </>
      )}

      {err && (
        <div className="label" style={{ color: "var(--red)", marginTop: 10 }}>
          ⚠ {err}
        </div>
      )}
    </Popover>
  );
}
