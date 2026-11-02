"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { logout as apiLogout, type Me } from "@/lib/api";

/**
 * Avatar trigger + dropdown menu. Items: Admin (admins only), Profile, Settings, Log out.
 * `direction` controls whether the menu grows down (topbar) or up (sidebar
 * footer). The trigger is supplied by the caller so each placement keeps its
 * own avatar/layout; this component only owns the open/close + menu.
 * A disclosure, not role="menu": the links follow the trigger in Tab order,
 * and Escape closes it and returns focus to the trigger.
 */
export default function ProfileMenu({
  user,
  direction = "down",
  align = "start",
  children,
}: {
  user: Me;
  direction?: "up" | "down";
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiLogout();
    } catch {
      // Ignore — reloading re-checks auth and falls back to the login screen.
    }
    window.location.assign("/");
  };

  return (
    <div className="pm-wrap" ref={wrapRef}>
      <button
        ref={trigger}
        type="button"
        className="pm-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Account menu"
      >
        {children}
      </button>

      {open && (
        <div id={id} className={`pm-menu pm-${direction} pm-align-${align}`}>
          {user.is_admin && (
            <Link
              href="/admin"
              className="pm-item pm-admin"
              onClick={() => setOpen(false)}
            >
              ★ Admin
            </Link>
          )}
          <Link
            href="/profile"
            className="pm-item"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className="pm-item"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            className="pm-item pm-signout"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
