"use client";

import { useEffect, useState } from "react";
import HudHeader from "@/components/HudHeader";
import LoginScreen from "@/components/LoginScreen";
import { me as fetchMe, type Me } from "@/lib/api";

type Phase = "loading" | "authed" | "anon";

/**
 * AuthN gate for the whole app. Checks GET /api/me on mount:
 * - loading  → minimal placeholder
 * - anon     → full-screen login (no header/dashboard)
 * - authed   → HUD header (with the user) + the requested page
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<Me | null>(null);

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
    return <LoginScreen />;
  }

  return (
    <>
      <HudHeader user={user} />
      <main
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "20px 16px 56px",
        }}
      >
        {children}
      </main>
    </>
  );
}
