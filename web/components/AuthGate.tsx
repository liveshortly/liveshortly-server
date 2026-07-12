"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthContext } from "@/components/AuthContext";
import BrandMark from "@/components/BrandMark";
import HudHeader from "@/components/HudHeader";
import Landing from "@/components/Landing";
import ThemeToggle from "@/components/ThemeToggle";
import { loginUrl, me as fetchMe, type Me } from "@/lib/api";

type Phase = "loading" | "authed" | "anon";

/**
 * AuthN gate for the whole app. Checks GET /api/me on mount:
 * - loading  → minimal placeholder
 * - anon     → marketing landing page (product pitch + sign-in/up + the
 *              public feed), EXCEPT on /session/*, which may be watchable
 *              anonymously (visibility="open"); that route gets a minimal
 *              guest header instead and decides access itself from the API
 *              response (401 there prompts sign-in inline).
 * - authed   → HUD header (with the user) + the requested page
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const pathname = usePathname();
  const isSessionRoute = pathname?.startsWith("/session/") ?? false;
  // Routes an anonymous visitor may see directly (with a guest header) instead
  // of the marketing landing page — session watch, the public feed the landing
  // page's "see all" links into, and the public install page.
  const isPublicRoute =
    isSessionRoute ||
    (pathname?.startsWith("/install") ?? false) ||
    (pathname?.startsWith("/feed") ?? false);

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

  if (phase === "loading") {
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

  if (phase === "anon" || !user) {
    if (isPublicRoute) {
      return (
        <AuthContext.Provider value={null}>
          <GuestHeader />
          <main className="app-main">{children}</main>
        </AuthContext.Provider>
      );
    }
    return <Landing />;
  }

  return (
    <AuthContext.Provider value={user}>
      <HudHeader user={user} />
      <main className="app-main">{children}</main>
    </AuthContext.Provider>
  );
}

/** Minimal top bar shown to anonymous visitors watching an open session link. */
function GuestHeader() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle />
          <a href={loginUrl()} className="lp-signin-btn">
            SIGN IN
          </a>
        </div>
      </div>
    </header>
  );
}
