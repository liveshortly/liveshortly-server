"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Topbar from "@/components/Topbar";
import WorkspaceSidebar from "@/components/WorkspaceSidebar";
import { WorkspaceDrawerContext } from "@/components/WorkspaceDrawerContext";
import type { Me } from "@/lib/api";

// Routes that own their own full-bleed layout inside `.ws-main` and must NOT
// get the default `.ws-content` centered/padded wrapper: the session viewer
// (fills the pane, handles its own height/scroll) and the home/HUD pages
// (their main+rightpanel already span edge to edge per the feed.html /
// hud.html mocks).
const FULL_BLEED_EXACT = ["/", "/hud"];
const FULL_BLEED_PREFIX = ["/session/"];
const isFullBleed = (pathname: string) =>
  FULL_BLEED_EXACT.includes(pathname) ||
  FULL_BLEED_PREFIX.some((p) => pathname.startsWith(p));

/**
 * Global authenticated app shell — designs/version3/feed.html `.shell`:
 * topbar + a persistent session-library sidebar, wrapping every authenticated
 * page (not just the HUD/session viewer, which is all the old `(workspace)`
 * route group covered). Sidebar/drawer mechanics are unchanged from that
 * layout, just promoted here so they apply everywhere.
 */
export default function AppShell({
  user,
  children,
}: {
  user: Me;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const [drawer, setDrawer] = useState(false);
  const drawerCtx = useMemo(
    () => ({
      open: drawer,
      setOpen: setDrawer,
      toggle: () => setDrawer((v) => !v),
    }),
    [drawer],
  );

  return (
    <div className="v3-app">
      <Topbar user={user} />
      <WorkspaceDrawerContext.Provider value={drawerCtx}>
        <div className="workspace" data-drawer={drawer ? "open" : "closed"}>
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

          <div className="ws-backdrop" onClick={() => setDrawer(false)} aria-hidden />

          <main className="ws-main">
            {isFullBleed(pathname) ? (
              children
            ) : (
              <div className="ws-content">{children}</div>
            )}
          </main>
        </div>
      </WorkspaceDrawerContext.Provider>
    </div>
  );
}
