"use client";

import { useState } from "react";
import Button from "./Button";
import s from "./ui.module.css";

/** Monospace block on the code tokens; long lines wrap, never clip. `copy`
 *  adds a Copy button that copies exactly `code`. */
export default function CodeBlock({ code, copy, label }: { code: string; copy?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  };
  return (
    <div className={s.code}>
      <pre className="t-mono" aria-label={label}>
        {code}
      </pre>
      {copy && (
        <Button className={s.codeCopy} onClick={doCopy} aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    </div>
  );
}
