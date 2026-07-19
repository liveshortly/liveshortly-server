"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A destructive-action trigger whose confirmation is a small popover (matching
 * the publish popover), not an inline expansion. Click the trigger → popover
 * with a message + Cancel / Confirm. Owns busy/err; the parent supplies the
 * async action via onConfirm.
 */
export default function ConfirmPopover({
  label,
  message,
  confirmLabel,
  busyLabel,
  onConfirm,
  triggerTitle,
  compact = false,
}: {
  label: string;
  message: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => Promise<void>;
  triggerTitle?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async () => {
    setBusy(true);
    setErr(false);
    try {
      await onConfirm();
      // Success: the parent typically unmounts or re-renders this away.
    } catch {
      setErr(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={ref} className="cf-wrap">
      <button
        type="button"
        className={`label cf-trigger${open ? " on" : ""}`}
        title={triggerTitle}
        onClick={() => {
          setErr(false);
          setOpen((v) => !v);
        }}
        style={{ padding: compact ? "4px 8px" : "5px 10px" }}
      >
        {err ? "⚠ RETRY" : label}
      </button>

      {open && (
        <div className="cf-pop" role="dialog" aria-label={confirmLabel}>
          <div className="cf-msg">{message}</div>
          <div className="cf-row">
            <button
              type="button"
              className="cf-no"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cf-yes"
              disabled={busy}
              onClick={run}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
