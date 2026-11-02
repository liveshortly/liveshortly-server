"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Topbar from "@/components/Topbar";
import AppFooter from "@/components/AppFooter";
import WorkspaceSidebar from "@/components/WorkspaceSidebar";
import MobileTabBar from "@/components/MobileTabBar";
import CommandPalette, { type DocLink } from "@/components/CommandPalette";
import { ShortcutsSheet, useShortcuts } from "@/components/Shortcuts";
import { WorkspaceDrawerContext } from "@/components/WorkspaceDrawerContext";
import { HostsProvider } from "@/components/HostsContext";
import { SessionsProvider } from "@/components/SessionsContext";
import type { Me } from "@/lib/api";
import s from "./shell.module.css";

// Routes that own their own full-bleed layout inside `.ws-main` and must NOT
// get the default `.ws-content` centered/padded wrapper.
const isFullBleed = (p: string) => p === "/sessions" || p.startsWith("/session/");

/**
 * The signed-in shell = Mac/Shell/RootView (LSW-03): the one header, the
 * sidebar (a drawer under 1100px), the detail pane, the one footer, and on
 * phones a bottom tab bar. ⌘K palette and the "?" shortcut sheet live here so
 * they work from every app page.
 */
export default function AppShell({
  user,
  docs,
  children,
}: {
  user: Me;
  docs: DocLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const drawerCtx = useMemo(
    () => ({ open: drawer, setOpen: setDrawer, toggle: () => setDrawer((v) => !v) }),
    [drawer],
  );
  const togglePalette = useCallback(() => setPalette((v) => !v), []);
  const openHelp = useCallback(() => setHelp(true), []);
  useShortcuts({ onPalette: togglePalette, onHelp: openHelp });

  // Navigating closes the drawer.
  useEffect(() => setDrawer(false), [pathname]);

  const inSession = pathname.startsWith("/session/");

  return (
    <div className="v3-app">
      <HostsProvider>
        <SessionsProvider>
          <a href="#main" className={s.skip}>
            Skip to content
          </a>
          <Topbar
            user={user}
            onMenu={() => setDrawer((v) => !v)}
            menuOpen={drawer}
            onSearch={() => setPalette(true)}
          />
          <WorkspaceDrawerContext.Provider value={drawerCtx}>
            <div className="workspace" data-drawer={drawer ? "open" : "closed"}>
              <aside className="ws-sidebar" aria-label="Sidebar">
                <WorkspaceSidebar />
              </aside>

              <div className="ws-backdrop" onClick={() => setDrawer(false)} aria-hidden />

              <main id="main" className="ws-main">
                {isFullBleed(pathname) ? children : <div className="ws-content">{children}</div>}
                {/* The session view fills the pane and scrolls internally. */}
                {!inSession && <AppFooter />}
              </main>
            </div>
          </WorkspaceDrawerContext.Provider>
          {/* The session view is full screen on phones (LSW-04 draws its back button). */}
          {!inSession && (
            <Suspense>
              <MobileTabBar />
            </Suspense>
          )}
          <CommandPalette
            open={palette}
            onClose={() => setPalette(false)}
            user={user}
            docs={docs}
            onHelp={openHelp}
          />
          <ShortcutsSheet open={help} onClose={() => setHelp(false)} />
        </SessionsProvider>
      </HostsProvider>
    </div>
  );
}
