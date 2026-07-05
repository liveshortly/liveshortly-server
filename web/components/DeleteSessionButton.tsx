"use client";

import { useState } from "react";
import { deleteSession } from "@/lib/api";

/**
 * Owner-only "delete session" control. Deletion is permanent and irreversible
 * (it wipes the DB rows, Redis keys and the blob archive), so the button is a
 * two-step confirm: the first click arms it, the second actually deletes.
 * Calls onDeleted() on success (e.g. redirect, or remove the row from a list).
 */
export default function DeleteSessionButton({
  id,
  onDeleted,
  compact = false,
}: {
  id: string;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const base: React.CSSProperties = {
    border: "1px solid var(--red)",
    background: "transparent",
    color: "var(--red)",
    padding: compact ? "4px 8px" : "5px 10px",
    fontSize: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          setErr(false);
          setArmed(true);
        }}
        className="label"
        title="Delete this session permanently"
        style={base}
      >
        {err ? "⚠ RETRY" : "⌫ DELETE"}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span className="label" style={{ color: "var(--red)" }}>
        DELETE FOREVER?
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(false);
          try {
            await deleteSession(id);
            onDeleted?.();
          } catch {
            setErr(true);
            setArmed(false);
          } finally {
            setBusy(false);
          }
        }}
        className="label"
        style={{
          ...base,
          background: "var(--red)",
          color: "var(--panel)",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "DELETING…" : "YES"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setArmed(false)}
        className="label"
        style={{ ...base, border: "1px solid var(--hairline)", color: "var(--muted)" }}
      >
        NO
      </button>
    </span>
  );
}
