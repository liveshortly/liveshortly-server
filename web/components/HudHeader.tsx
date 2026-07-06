"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
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
  const [scrolled, setScrolled] = useState(false);

  // Collapse the header into a slim bar once the page is scrolled a little,
  // so the wordmark + tabs stay pinned while the stats/status make way.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
    <header
      style={{
        borderBottom: "1px solid var(--strong)",
        background: "var(--panel)",
        boxShadow: scrolled ? "0 6px 20px -12px rgba(0,0,0,0.35)" : "none",
        transition: "box-shadow 0.25s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: scrolled ? "7px 16px" : "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          transition: "padding 0.25s ease",
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontSize: scrolled ? 15 : 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                transition: "font-size 0.25s ease",
              }}
            >
              <BrandMark />
              LiveShortly
              <span className="blink" style={{ color: "var(--muted)" }}>
                _
              </span>
            </Link>
            {/* Compact live badge — only while collapsed, so status is never lost. */}
            {scrolled && (
              <span
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: liveNow > 0 ? "var(--green)" : "var(--faint)",
                }}
              >
                {liveNow > 0 ? (
                  <span className="live-dot" />
                ) : (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      background: "var(--faint)",
                      display: "inline-block",
                    }}
                  />
                )}
                {liveNow > 0 ? `${fmtInt(liveNow)} LIVE` : "IDLE"}
              </span>
            )}
          </div>
          <div
            className="label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: ok ? "var(--muted)" : "var(--red)",
              overflow: "hidden",
              marginTop: scrolled ? 0 : 6,
              maxHeight: scrolled ? 0 : 24,
              opacity: scrolled ? 0 : 1,
              transition: "max-height 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease",
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

        {/* Stat panels — clicking filters the session list by status.
            Collapse away once scrolled; the compact live badge covers status. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
            gap: 12,
            flex: scrolled ? "0 1 0" : "1 1 320px",
            maxWidth: scrolled ? 0 : 480,
            opacity: scrolled ? 0 : 1,
            overflow: "hidden",
            pointerEvents: scrolled ? "none" : "auto",
            transition: "flex-basis 0.25s ease, max-width 0.25s ease, opacity 0.2s ease",
          }}
        >
          <StatTile
            href="/hud?status=all"
            label="Total Sessions"
            value={data ? fmtInt(data.total_sessions) : "··"}
          />
          <StatTile
            href="/hud?status=live"
            label="Live Now"
            value={data ? fmtInt(data.live_now) : "··"}
            accent={liveNow > 0 ? "green" : "ink"}
          />
        </div>

        {/* Theme + user: stacked when open, inline when collapsed so the slim
            bar stays a single row. */}
        <div
          style={{
            display: "flex",
            flexDirection: scrolled ? "row" : "column",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: scrolled ? 12 : 8,
            marginLeft: "auto",
            borderLeft: "1px solid var(--hairline)",
            paddingLeft: 14,
            transition: "gap 0.25s ease",
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
    <HudTabs admin={!!user?.is_admin} />
    </div>
  );
}

/** The primary tab bar — sits on the header line like terminal tabs. The ADMIN
 *  tab appears only for super-admins and carries the distinct admin accent. */
function HudTabs({ admin }: { admin?: boolean }) {
  const pathname = usePathname() || "/";
  const tabs = [
    { href: "/", label: "▣ FEED", match: (p: string) => p === "/" || p === "/feed", accent: "var(--green)" },
    { href: "/hud", label: "⌂ MY HUD", match: (p: string) => p.startsWith("/hud"), accent: "var(--green)" },
    { href: "/profile", label: "◇ PROFILE", match: (p: string) => p.startsWith("/profile"), accent: "var(--green)" },
    ...(admin
      ? [
          {
            href: "/admin",
            label: "★ ADMIN",
            match: (p: string) => p.startsWith("/admin"),
            accent: "var(--admin)",
          },
        ]
      : []),
  ];
  return (
    <nav
      style={{
        borderBottom: "1px solid var(--hairline)",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          gap: 4,
        }}
      >
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="label"
              style={{
                position: "relative",
                top: 1, // overlap the strip's bottom border for a "tab" feel
                padding: "11px 16px",
                fontSize: 11,
                letterSpacing: "0.12em",
                color: active ? t.accent : "var(--muted)",
                background: active ? "var(--panel)" : "transparent",
                border: active ? "1px solid var(--hairline)" : "1px solid transparent",
                borderBottom: active
                  ? `2px solid ${t.accent}`
                  : "2px solid transparent",
                fontWeight: active ? 700 : 500,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
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
