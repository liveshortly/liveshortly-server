"use client";

import { useState } from "react";
import s from "./InstallCommand.module.css";

/** A command block with click-to-copy. Long lines wrap (never cut off at any
 *  width); multi-line blocks keep their lines and scroll sideways. The `$`
 *  prompt is decoration only: Copy copies exactly `command`. */
export default function InstallCommand({
  command,
  prompt = "$",
}: {
  command: string;
  prompt?: string;
}) {
  const [copied, setCopied] = useState(false);
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
    <div className={s.box}>
      {!multiline && (
        <span className={s.prompt} aria-hidden>
          {prompt}
        </span>
      )}
      <code className={multiline ? s.block : s.line}>{command}</code>
      <button
        type="button"
        onClick={copy}
        className={s.copy}
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
