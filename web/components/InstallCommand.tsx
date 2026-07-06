"use client";

import { useState } from "react";

/** A terminal-style command block with a click-to-copy button, in the app theme. */
export default function InstallCommand({
  command,
  prompt = "$",
}: {
  command: string;
  prompt?: string;
}) {
  const [copied, setCopied] = useState(false);

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
        alignItems: "center",
        gap: 12,
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        padding: "12px 14px",
        // Never let this box push its container wider than available.
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <span style={{ color: "var(--green)", flexShrink: 0 }} aria-hidden>
        {prompt}
      </span>
      <code
        style={{
          fontSize: 13,
          color: "var(--ink)",
          whiteSpace: "nowrap",
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
          border: "1px solid var(--strong)",
          background: copied ? "var(--green)" : "transparent",
          color: copied ? "var(--panel)" : "var(--ink)",
          padding: "5px 10px",
          fontSize: 10,
          cursor: "pointer",
        }}
      >
        {copied ? "✓ COPIED" : "⧉ COPY"}
      </button>
    </div>
  );
}
