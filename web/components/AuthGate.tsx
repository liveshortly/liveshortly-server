"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthContext } from "@/components/AuthContext";
import AppShell from "@/components/AppShell";
import BrandMark from "@/components/BrandMark";
import Landing from "@/components/Landing";
import ThemeToggle from "@/components/ThemeToggle";
import { loginUrl, me as fetchMe, type Me } from "@/lib/api";

type Phase = "loading" | "authed" | "anon";

// App routes: need a signed-in user. Keep in sync with the matcher in
// middleware.ts, which redirects signed-out visitors before they get here.
// EVERYTHING else is public (landing, feed, docs, install, changelog, session,
// replay, story) or a 404, and renders its content on the server.
const PRIVATE_PREFIXES = ["/hud", "/sessions", "/profile", "/settings", "/admin", "/compose"];
const isPrivate = (p: string) =>
  PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Client-side auth enhancement. Checks GET /api/me on mount, but public pages
 * never wait on it — their server-rendered content shows immediately:
 * - authed     → HUD shell (with the user) + the requested page
 * - `/`        → the page itself (the landing; middleware already sent
 *                signed-in visitors to /sessions)
 * - public/404 → guest header + the page; swaps to the HUD shell if /api/me
 *                says the visitor is signed in
 * - private    → placeholder while checking, landing if the cookie was stale
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
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
        <AppShell user={user}>{children}</AppShell>
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
      {pathname === "/" ? (
        children
      ) : (
        <>
          <GuestHeader pending={phase === "loading"} />
          <main className="app-main">{children}</main>
        </>
      )}
    </AuthContext.Provider>
  );
}

/** Minimal top bar for anonymous visitors on public pages. */
function GuestHeader({ pending }: { pending: boolean }) {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--strong)",
        background: "var(--panel)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/"
          aria-label="LiveShortly home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <BrandMark />
          LiveShortly
          <span className="blink" style={{ color: "var(--muted)" }}>
            _
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/docs"
            style={{
              fontSize: 13,
              fontFamily: "monospace",
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            Docs
          </Link>
          <Link
            href="/install"
            style={{
              fontSize: 13,
              fontFamily: "monospace",
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            ⇩ Install CLI
          </Link>
          <ThemeToggle />
          {/* Hidden (not removed) until /api/me answers, so a signed-in
              visitor never sees a "Sign in" flash and nothing shifts. */}
          <a
            href={loginUrl()}
            className="lp-signin-btn"
            style={pending ? { visibility: "hidden" } : undefined}
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}
