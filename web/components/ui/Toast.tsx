"use client";

import { useEffect, type ReactNode } from "react";
import { IconButton } from "./Button";
import s from "./ui.module.css";

/** Transient confirmation, bottom-centre, gone after 6 s like the Mac's.
 *  The caller owns the state: render it while there is a message, clear it in
 *  onDismiss. role="status" so screen readers announce it politely. */
export default function Toast({
  children,
  onDismiss,
  ms = 6000,
}: {
  children: ReactNode;
  onDismiss: () => void;
  ms?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [onDismiss, ms, children]);
  return (
    <div role="status" className={`${s.toast} t-callout`}>
      <span>{children}</span>
      <IconButton icon="xmark" label="Dismiss" onClick={onDismiss} />
    </div>
  );
}
