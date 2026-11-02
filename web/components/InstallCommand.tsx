"use client";

import { useState } from "react";

/** A terminal-style command block with a click-to-copy button, in the app theme. */
export default function InstallCommand({
  command,
  prompt = "$",
  hero = false,
}: {
  command: string;
  prompt?: string;
  /** The install page's headline copy: larger, on the always-dark hero band. */
  hero?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // A heredoc or a chained setup keeps its own lines; one-liners refuse to
  // wrap mid-flag and scroll inside the box instead.
  const multiline = command.includes("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard may be blocked; the command is still selectable
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: multiline ? "flex-start" : "center",
        gap: hero ? 14 : 12,
        border: hero ? "none" : "1px solid var(--hairline)",
        background: hero ? "transparent" : "var(--bg)",
        borderRadius: hero ? 0 : 10,
        padding: hero ? "18px 20px" : "12px 14px",
        // Never let this box push its container wider than available.
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          color: hero ? "var(--ins-accent)" : "var(--green)",
          fontFamily: "var(--font-mono)",
          fontSize: hero ? 14 : 13,
          flexShrink: 0,
        }}
        aria-hidden
      >
        {prompt}
      </span>
      <code
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: hero ? 13.5 : 13,
          lineHeight: multiline ? 1.7 : undefined,
          color: hero ? "var(--ins-ink)" : "var(--ink)",
          whiteSpace: multiline ? "pre" : "nowrap",
          flex: 1,
          // The command itself is the scroll box: a too-long command scrolls
          // HERE (inside the cell) instead of the whole page, and COPY stays put.
          minWidth: 0,
          overflowX: "auto",
        }}
      >
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="label"
        style={{
          flexShrink: 0,
          border: hero ? "none" : "1px solid var(--hairline)",
          borderRadius: 999,
          background: hero
            ? "var(--ins-accent)"
            : copied
              ? "var(--green)"
              : "transparent",
          color: hero
            ? "var(--ins-bg)"
            : copied
              ? "var(--panel)"
              : "var(--muted)",
          padding: hero ? "9px 16px" : "5px 10px",
          fontSize: hero ? 12 : 10,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
