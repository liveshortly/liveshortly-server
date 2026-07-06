"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthContext";
import WorkspaceSidebar from "@/components/WorkspaceSidebar";

/**
 * Workspace shell for the signed-in session surfaces (HUD + session viewer).
 * A persistent left sidebar (the session list) sits beside the main pane and
 * does NOT remount as you navigate between /hud and /session/{id} — so clicking
 * a session keeps the list open, ChatGPT-style.
 *
 * Anonymous visitors (watching an open session link) get no sidebar: the layout
 * passes the page through untouched, so the public viewer stays full-width.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = !!useAuth()?.authenticated;
  const [drawer, setDrawer] = useState(false);

  // Anonymous visitors (watching an open session link) get no sidebar — the
  // public viewer stays full-width. Auth is already resolved by AuthGate (via
  // context), so this is synchronous: the page mounts once, in the right place.
  if (!authed) {
    return <>{children}</>;
  }

  return (
    <div className="workspace" data-drawer={drawer ? "open" : "closed"}>
      {/* Mobile toggle — hidden on desktop via CSS */}
      <button
        type="button"
        className="ws-toggle label"
        onClick={() => setDrawer((v) => !v)}
        aria-label={drawer ? "Hide sessions" : "Show sessions"}
      >
        {drawer ? "✕ SESSIONS" : "☰ SESSIONS"}
      </button>

      <aside className="ws-sidebar" onClick={() => setDrawer(false)}>
        <WorkspaceSidebar />
      </aside>

      {/* Backdrop closes the drawer on mobile */}
      <div className="ws-backdrop" onClick={() => setDrawer(false)} aria-hidden />

      <div className="ws-main">{children}</div>
    </div>
  );
}
