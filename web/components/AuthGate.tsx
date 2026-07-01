"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import HudHeader from "@/components/HudHeader";
import LoginScreen from "@/components/LoginScreen";
import ThemeToggle from "@/components/ThemeToggle";
import { loginUrl, me as fetchMe, type Me } from "@/lib/api";

type Phase = "loading" | "authed" | "anon";

/**
 * AuthN gate for the whole app. Checks GET /api/me on mount:
 * - loading  → minimal placeholder
 * - anon     → full-screen login (no header/dashboard), EXCEPT on /session/*,
 *              which may be watchable anonymously (visibility="open"); that
 *              route gets a minimal guest header instead and decides access
 *              itself from the API response (401 there prompts sign-in inline).
 * - authed   → HUD header (with the user) + the requested page
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const pathname = usePathname();
  const isSessionRoute = pathname?.startsWith("/session/") ?? false;

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
    if (isSessionRoute) {
      return (
        <>
          <GuestHeader />
          <main className="app-main">{children}</main>
        </>
      );
    }
    return <LoginScreen />;
  }

  return (
    <>
      <HudHeader user={user} />
      <main className="app-main">{children}</main>
    </>
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
          gap: 16,
        }}
      >
        <span
          className="label"
          style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          LiveShortly
          <span className="blink" style={{ color: "var(--muted)" }}>
            _
          </span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle />
          <a
            href={loginUrl()}
            className="label"
            style={{
              border: "1px solid var(--strong)",
              padding: "6px 12px",
              fontSize: 10,
              color: "var(--ink)",
            }}
          >
            SIGN IN
          </a>
        </div>
      </div>
    </header>
  );
}
