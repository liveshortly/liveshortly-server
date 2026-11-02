"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";
import s from "./ui.module.css";

/**
 * Modal dialog on the native <dialog>: showModal() makes the page behind it
 * inert (focus stays inside), Escape closes it, and focus returns to the
 * trigger on close. `sheet` uses the sheet radius and docks to the
 * bottom edge on phones.
 */
export default function Dialog({
  open,
  onClose,
  title,
  sheet,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sheet?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) d.close();
    // Not every browser restores focus on close (older Safari): do it here.
    if (!open && opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${s.dialog}${sheet ? ` ${s.sheet}` : ""}`}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <>
          <div className={s.dialogHead}>
            <h2 id={titleId} className="t-title">
              {title}
            </h2>
            <IconButton icon="xmark" label="Close" onClick={onClose} />
          </div>
          <div className={s.dialogBody}>{children}</div>
        </>
      )}
    </dialog>
  );
}
