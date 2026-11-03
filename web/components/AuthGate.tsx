"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthContext } from "@/components/AuthContext";
import AppShell from "@/components/AppShell";
import Landing from "@/components/Landing";
import Topbar from "@/components/Topbar";
import type { DocLink } from "@/components/CommandPalette";
import { me as fetchMe, type Me } from "@/lib/api";
import { isPrivate } from "@/lib/routes";
import s from "./shell.module.css";

type Phase = "loading" | "authed" | "anon";

/**
 * Client-side auth enhancement. Checks GET /api/me on mount, but public pages
 * never wait on it — their server-rendered content shows immediately:
 * - authed     → app shell (with the user) + the requested page
 * - `/`        → the page itself (the landing; middleware already sent
 *                signed-in visitors to /sessions)
 * - public/404 → the one header + the page + the one footer; swaps to the
 *                shell if /api/me says the visitor is signed in
 * - private    → placeholder while checking, landing if the cookie was stale
 */
export default function AuthGate({
  docs,
  children,
}: {
  /** Docs titles for the ⌘K palette (read on the server in app/layout.tsx). */
  docs: DocLink[];
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const m = await fetchMe(ctrl.signal);
        if (!alive) return;
        if (m.authenticated) {
          setUser(m);
          setPhase("authed");
        } else {
          setPhase("anon");
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (alive) setPhase("anon");
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  if (phase === "authed" && user) {
    return (
      <AuthContext.Provider value={user}>
        <AppShell user={user} docs={docs}>
          {children}
        </AppShell>
      </AuthContext.Provider>
    );
  }

  if (isPrivate(pathname)) {
    if (phase === "anon") return <Landing />;
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="label" style={{ color: "var(--muted)" }}>
          …<span className="blink">_</span>
        </span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={null}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      {pathname === "/" ? (
        children
      ) : (
        <>
          <Topbar user={null} pending={phase === "loading"} />
          <main id="main" className="app-main">
            {children}
          </main>
        </>
      )}
    </AuthContext.Provider>
  );
}
