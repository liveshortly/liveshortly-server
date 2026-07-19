"use client";

import { useEffect, useRef, useState } from "react";
import { generateHandoff, type Handoff } from "@/lib/api";

/**
 * "Continue this session" — mints a handoff code and reveals a copyable
 * `live <agent> --handoff <code>` command. Available to anyone who can read the
 * session (the fork is authorized again server-side at redeem time and becomes a
 * NEW session owned by whoever runs the command). The original is untouched.
 */
export default function HandoffButton({
  sessionId,
  placement = "down",
  fullWidth = false,
}: {
  sessionId: string;
  /** Which way the command popover opens. Use "up" inside the bottom sheet. */
  placement?: "down" | "up";
  /** Stretch the trigger to fill its row (mobile sheet). */
  fullWidth?: boolean;
}) {
  const [ho, setHo] = useState<Handoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss the command popover on outside-click or Escape.
  useEffect(() => {
    if (!ho) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setHo(null);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHo(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ho]);

  const open = async () => {
    if (ho) {
      setHo(null); // toggle closed
      return;
    }
    setBusy(true);
    setErr(false);
    try {
      setHo(await generateHandoff(sessionId));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!ho) return;
    try {
      await navigator.clipboard.writeText(ho.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const up = placement === "up";
  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: fullWidth ? "block" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
      }}
    >
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="label"
        title="Fork this session as a new session you own (any agent)"
        style={{
          border: `1px solid ${err ? "var(--red)" : "var(--strong)"}`,
          background: "transparent",
          color: err ? "var(--red)" : ho ? "var(--green)" : "var(--ink)",
          padding: "5px 10px",
          fontSize: 10,
          cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap",
          opacity: busy ? 0.6 : 1,
          width: fullWidth ? "100%" : undefined,
        }}
      >
        {busy ? "…" : err ? "⚠ RETRY" : "⑃ FORK"}
      </button>

      {ho && (
        <div
          role="dialog"
          aria-label="Handoff command"
          style={
            fullWidth
              ? {
                  // In the mobile sheet: expand in-flow, full width, so it
                  // never floats off-screen.
                  position: "static",
                  width: "100%",
                  marginTop: 6,
                  border: "1px solid var(--strong)",
                  background: "var(--panel2)",
                  padding: 12,
                }
              : {
                  position: "absolute",
                  top: up ? undefined : "calc(100% + 6px)",
                  bottom: up ? "calc(100% + 6px)" : undefined,
                  // Left-align to the trigger; a right-anchored popover would
                  // spill over the sidebar in the inline action row.
                  left: 0,
                  zIndex: 40,
                  width: "min(92vw, 420px)",
                  border: "1px solid var(--strong)",
                  background: "var(--panel2)",
                  padding: 12,
                  boxShadow: "0 8px 26px var(--shadow)",
                }
          }
        >
          <div
            className="label"
            style={{ color: "var(--muted)", marginBottom: 8, letterSpacing: "0.06em" }}
          >
            RUN TO FORK THIS SESSION
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
            <input
              readOnly
              value={ho.command}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "var(--mono, monospace)",
                fontSize: 12,
                border: "1px solid var(--hairline)",
                background: "var(--bg)",
                color: "var(--ink)",
                padding: "6px 8px",
              }}
            />
            <button
              type="button"
              onClick={copy}
              className="label"
              style={{
                border: "1px solid var(--strong)",
                background: "transparent",
                color: copied ? "var(--green)" : "var(--ink)",
                padding: "0 10px",
                fontSize: 10,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ COPIED" : "COPY"}
            </button>
          </div>
          <div
            className="label"
            style={{ color: "var(--muted)", marginTop: 8, fontSize: 9, lineHeight: 1.5 }}
          >
            Swap <code>claude</code> for any agent (<code>gemini</code>, <code>codex</code>…).
            Becomes a new session you own · code expires in 7 days.
          </div>
        </div>
      )}
    </div>
  );
}
