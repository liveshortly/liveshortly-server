"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Popover, { PopoverHeader } from "@/components/Popover";
import { notifications, type Approval } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const POLL_MS = 20_000;
const BADGE_RE = /^\(\d+\) /;

/**
 * Header bell (LSW-21, approvals first): permission requests waiting across
 * the caller's live sessions, a count badge, and a "(n) " tab-title prefix.
 * Polls /api/notifications; never asks for notification permission — that
 * happens only on an explicit click in Settings.
 */
export default function NotificationBell() {
  const [items, setItems] = useState<Approval[]>([]);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      notifications(ctrl.signal)
        .then(setItems)
        .catch(() => {}); // signed out / offline: keep the last list
    };
    load();
    const iv = setInterval(load, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ctrl.abort();
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname]);

  // Tab title badge. Re-applied on navigation since each page sets its own title.
  const n = items.length;
  useEffect(() => {
    const base = document.title.replace(BADGE_RE, "");
    document.title = n > 0 ? `(${n}) ${base}` : base;
  }, [n, pathname]);

  const label = n > 0 ? `Notifications: ${n} approval${n === 1 ? "" : "s"} needed` : "Notifications";

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="v3-icon-btn"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer" }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11L4 11Z" />
          <path d="M6.5 14a1.5 1.5 0 0 0 3 0" />
        </svg>
        {n > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 1,
              right: 0,
              minWidth: 15,
              height: 15,
              padding: "0 4px",
              borderRadius: 8,
              background: "var(--amber)",
              color: "var(--on-accent)",
              fontSize: 10,
              lineHeight: "15px",
              fontWeight: 600,
            }}
          >
            {n > 9 ? "9+" : n}
          </span>
        )}
      </button>
      {open && (
        <Popover anchorEl={btn.current} onClose={() => setOpen(false)} ariaLabel="Notifications">
          <PopoverHeader title="Approvals" onClose={() => setOpen(false)} />
          {n === 0 ? (
            <p className="t-callout" style={{ color: "var(--muted)", margin: 0 }}>
              Nothing needs your approval.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {items.map((a) => (
                <li key={a.session_id}>
                  <Link href={`/session/${a.session_id}`} onClick={() => setOpen(false)} style={{ display: "block" }}>
                    <div className="t-headline">{a.title}</div>
                    <div className="t-callout" style={{ color: "var(--muted)" }}>
                      {a.message || "An agent is asking permission."} · {timeAgo(a.ts)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/settings#notifications"
            className="t-caption"
            onClick={() => setOpen(false)}
            style={{ display: "block", marginTop: 12, color: "var(--muted)" }}
          >
            Notification settings
          </Link>
        </Popover>
      )}
    </>
  );
}
