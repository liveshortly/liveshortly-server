"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout as apiLogout, type Me } from "@/lib/api";

/**
 * Avatar trigger + dropdown menu. Items: Admin (admins only), Profile, Log out.
 * `direction` controls whether the menu grows down (topbar) or up (sidebar
 * footer). The trigger is supplied by the caller so each placement keeps its
 * own avatar/layout; this component only owns the open/close + menu.
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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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
        type="button"
        className="pm-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {children}
      </button>

      {open && (
        <div
          className={`pm-menu pm-${direction} pm-align-${align}`}
          role="menu"
        >
          {user.is_admin && (
            <Link
              href="/admin"
              className="pm-item pm-admin"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              ★ Admin
            </Link>
          )}
          <Link
            href="/profile"
            className="pm-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <button
            type="button"
            className="pm-item pm-signout"
            role="menuitem"
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
