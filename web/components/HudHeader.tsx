"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Clock from "@/components/Clock";
import Panel from "@/components/Panel";
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
              gap: 8,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            <span
              aria-hidden
              style={{
                border: "1px solid var(--strong)",
                padding: "1px 6px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              LS
            </span>
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
        </div>

        {/* Stat panels */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
            gap: 12,
            flex: "1 1 320px",
          }}
        >
          <Panel
            label="Total Sessions"
            value={data ? fmtInt(data.total_sessions) : "··"}
          />
          <Panel
            label="Live Now"
            value={data ? fmtInt(data.live_now) : "··"}
            accent={liveNow > 0 ? "green" : "ink"}
          />
        </div>

        {/* User + sign-out */}
        {user?.authenticated && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderLeft: "1px solid var(--hairline)",
              paddingLeft: 14,
            }}
          >
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt=""
                width={28}
                height={28}
                referrerPolicy="no-referrer"
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  border: "1px solid var(--hairline)",
                }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--hairline)",
                  background: "var(--bg)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div style={{ minWidth: 0, maxWidth: 160 }}>
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
    </header>
  );
}
