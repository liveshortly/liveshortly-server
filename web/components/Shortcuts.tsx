"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/ui/Dialog";
import { ROUTES } from "@/lib/routes";
import s from "./shell.module.css";

/**
 * App keyboard shortcuts (LSW-03, the Mac's menu shortcuts). Page-specific
 * ones reach the page as cancelable window events, so the shell never imports
 * the session view:
 *   ls:focus-composer · ls:stop-agent · ls:refresh
 * A page that handles one calls `e.preventDefault()`; the shell then swallows
 * the key. Unhandled, ⌘L falls back to focusing `[data-composer]` and ⌘R to
 * the browser's own reload, so the shortcut always does something sensible.
 */

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
/** "⌘" on Apple platforms, "Ctrl+" elsewhere. */
export const mod = () => (isMac() ? "⌘" : "Ctrl+");

export const SHORTCUTS = [
  { keys: ["K"], label: "Command palette" },
  { keys: ["N"], alt: ["⇧", "N"], label: "New session" },
  { keys: ["L"], label: "Focus composer" },
  { keys: ["."], label: "Stop agent" },
  { keys: ["R"], label: "Refresh" },
  { keys: ["?"], label: "Keyboard shortcuts", bare: true },
] as const;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** True when some page handled the event (called preventDefault). */
const emit = (name: string) => !window.dispatchEvent(new Event(name, { cancelable: true }));

export function useShortcuts({
  onPalette,
  onHelp,
}: {
  onPalette: () => void;
  onHelp: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = isMac() ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (m && !e.altKey) {
        let handled = false;
        if (k === "k") {
          onPalette();
          handled = true;
        } else if (k === "n") {
          // ponytail: Chrome/Safari reserve ⌘N/⇧⌘N and never deliver them;
          // ⌘K → New session is the path that always works.
          router.push(ROUTES.newSession);
          handled = true;
        } else if (k === "l" && !e.shiftKey) {
          handled = emit("ls:focus-composer");
          if (!handled) {
            const c = document.querySelector<HTMLElement>("[data-composer]");
            if (c) {
              c.focus();
              handled = true;
            }
          }
        } else if (k === ".") {
          handled = emit("ls:stop-agent");
        } else if (k === "r" && !e.shiftKey) {
          handled = emit("ls:refresh");
        }
        if (handled) e.preventDefault();
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !typing(e.target)) {
        e.preventDefault();
        onHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onPalette, onHelp]);
}

/** The "?" sheet. */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = mod();
  const keys = (ks: readonly string[], bare?: boolean) => (
    <span className={s.keys}>
      {!bare && <kbd>{m.replace("+", "")}</kbd>}
      {ks.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
    </span>
  );
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" sheet>
      <dl className={s.shortcuts}>
        {SHORTCUTS.map((sc) => (
          <div key={sc.label}>
            <dt className="t-body">{sc.label}</dt>
            <dd>
              {keys(sc.keys, "bare" in sc && sc.bare)}
              {"alt" in sc && (
                <>
                  <span className="t-callout"> or </span>
                  {keys(sc.alt)}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
