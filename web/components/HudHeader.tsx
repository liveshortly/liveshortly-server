"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Clock from "@/components/Clock";
import Panel from "@/components/Panel";
import ThemeToggle from "@/components/ThemeToggle";
import {
  stats as fetchStats,
  logout as apiLogout,
  type Stats,
  type Me,
} from "@/lib/api";
import { fmtInt } from "@/lib/utils";

/** Top HUD bar: wordmark, live status + UTC clock, stat panels, user + sign-out. */
export default function HudHeader({ user }: { user?: Me | null }) {
  const [data, setData] = useState<Stats | null>(null);
  const [ok, setOk] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiLogout();
    } catch {
      // Ignore — reloading re-checks auth and falls back to the login screen.
    }
    // Reload so AuthGate re-runs /api/me → now 401 → login screen.
    window.location.assign("/");
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await fetchStats();
        if (alive) {
          setData(s);
          setOk(true);
        }
      } catch {
        if (alive) setOk(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const liveNow = data?.live_now ?? 0;

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
          alignItems: "stretch",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Wordmark + status */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: "1 1 240px",
            minWidth: 220,
          }}
        >
          <Link
            href="/"
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
          <div
            className="label"
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: ok ? "var(--muted)" : "var(--red)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: liveNow > 0 ? "var(--green)" : "var(--muted)",
              }}
            >
              {liveNow > 0 ? (
                <span className="live-dot" />
              ) : (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    background: "var(--faint)",
                    display: "inline-block",
                  }}
                />
              )}
              {liveNow > 0 ? "LIVE" : "IDLE"}
            </span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <Clock />
            {!ok && (
              <>
                <span style={{ color: "var(--hairline)" }}>·</span>
                <span style={{ color: "var(--red)" }}>API OFFLINE</span>
              </>
            )}
          </div>
          <nav style={{ marginTop: 8, display: "flex", gap: 16 }}>
            <NavLink href="/" label="HUD" />
            <NavLink href="/feed" label="FEED" />
          </nav>
        </div>

        {/* Stat panels — clicking filters the session list by status. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
            gap: 12,
            flex: "1 1 320px",
          }}
        >
          <StatTile
            href="/?status=all"
            label="Total Sessions"
            value={data ? fmtInt(data.total_sessions) : "··"}
          />
          <StatTile
            href="/?status=live"
            label="Live Now"
            value={data ? fmtInt(data.live_now) : "··"}
            accent={liveNow > 0 ? "green" : "ink"}
          />
        </div>

        {/* Theme stacked above user + sign-out for a leaner column. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
            borderLeft: "1px solid var(--hairline)",
            paddingLeft: 14,
          }}
        >
          <ThemeToggle />
          {user?.authenticated && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
            <span aria-hidden style={{ color: "var(--green)", fontSize: 12 }}>●</span>
            <div style={{ minWidth: 0, maxWidth: 200 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={user.email}
              >
                {user.name ?? user.email ?? "signed in"}
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="label"
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  marginTop: 2,
                  cursor: signingOut ? "default" : "pointer",
                  color: "var(--red)",
                  fontSize: 10,
                }}
              >
                {signingOut ? "SIGNING OUT…" : "↩ SIGN OUT"}
              </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** A compact top-nav link in the HUD header. */
function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="label"
      style={{
        color: "var(--muted)",
        borderBottom: "1px solid transparent",
        paddingBottom: 1,
        letterSpacing: "0.1em",
      }}
    >
      {label}
    </Link>
  );
}

/** The green LiveShortly brand mark (matches the favicon). */
function BrandMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="32" height="32" rx="6" fill="var(--green)" />
      <rect x="7" y="8.5" width="6.5" height="15" rx="1.5" fill="var(--panel)" />
      <rect
        x="16.5"
        y="8.5"
        width="8.5"
        height="15"
        rx="1.5"
        fill="var(--green)"
        stroke="var(--panel)"
        strokeWidth="2"
      />
    </svg>
  );
}

/** A clickable HUD stat tile that links to a filtered session view. */
function StatTile({
  href,
  label,
  value,
  accent,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  accent?: "green" | "ink";
}) {
  return (
    <Link href={href} className="stat-tile" style={{ display: "block" }}>
      <Panel label={label} value={value} accent={accent} />
    </Link>
  );
}
