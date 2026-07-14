"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import Avatar from "@/components/Avatar";
import { listSessions, logout as apiLogout, type Session } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const POLL_MS = 5000;

type Tab = "all" | "live" | "shared";

/**
 * ChatGPT-style session list. Lives in the app shell so it persists as the
 * user navigates between pages. Groups the user's own sessions (LIVE pinned,
 * then archived by recency) plus a "shared with me" section, with a search
 * filter and All/Live/Shared tabs. Each row links to /session/{id}.
 */
export default function WorkspaceSidebar() {
  const pathname = usePathname() || "";
  const activeId = pathname.startsWith("/session/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : null;
  const user = useAuth();

  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [signingOut, setSigningOut] = useState(false);

  // Poll both lists so live status + new sessions show up without a reload.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [m, s] = await Promise.all([
          listSessions({ scope: "mine", status: "all", limit: 200 }),
          listSessions({ scope: "shared", status: "all", limit: 100 }),
        ]);
        if (!alive) return;
        setMine(m.results);
        setShared(s.results);
      } catch {
        // keep the last good list on a transient error
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const needle = q.trim().toLowerCase();
  const match = (s: Session) =>
    !needle ||
    s.title?.toLowerCase().includes(needle) ||
    s.tags?.some((t) => t.toLowerCase().includes(needle));

  const groups = useMemo(() => {
    const m = (mine ?? []).filter(match);
    const live = m.filter((s) => s.status === "live");
    const ended = m
      .filter((s) => s.status !== "live")
      .sort(
        (a, b) =>
          +new Date(b.ended_at ?? b.created_at) -
          +new Date(a.ended_at ?? a.created_at),
      );
    // Recency buckets, in order.
    const buckets: { label: string; items: Session[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "Previous 7 days", items: [] },
      { label: "Older", items: [] },
    ];
    const now = Date.now();
    const day = 86_400_000;
    for (const s of ended) {
      const age = now - +new Date(s.ended_at ?? s.created_at);
      if (age < day) buckets[0].items.push(s);
      else if (age < 2 * day) buckets[1].items.push(s);
      else if (age < 7 * day) buckets[2].items.push(s);
      else buckets[3].items.push(s);
    }
    return {
      live,
      buckets: buckets.filter((b) => b.items.length > 0),
      shared: (shared ?? []).filter(match),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, shared, needle]);

  const loading = mine == null;

  const showLive = tab !== "shared" && groups.live.length > 0;
  const showBuckets = tab === "all" ? groups.buckets : [];
  const showShared = tab !== "live" && groups.shared.length > 0;
  const empty =
    !loading && !showLive && showBuckets.length === 0 && !showShared;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiLogout();
    } catch {
      // Ignore — reloading re-checks auth and falls back to the login screen.
    }
    window.location.assign("/");
  };

  return (
    <div className="ws-sidebar-inner">
      <div className="ws-head">
        <Link href="/hud" className="ws-head-link" title="Open My HUD">
          <span className="label">⌂ Your Sessions</span>
          <span className="ws-head-arrow" aria-hidden>
            →
          </span>
        </Link>
      </div>

      <div className="ws-tabs">
        {(["all", "live", "shared"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className="ws-tab"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 10px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid var(--hairline)",
            background: "var(--bg)",
            padding: "0 10px",
          }}
        >
          <span className="label" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SEARCH SESSIONS"
            aria-label="Search your sessions"
            spellCheck={false}
            className="label"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              padding: "9px 0",
              width: "100%",
              fontSize: 11,
              letterSpacing: "0.06em",
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear"
              className="label"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px 12px" }}>
        {loading ? (
          <div className="label" style={{ color: "var(--faint)", padding: "16px 6px" }}>
            LOADING<span className="blink">_</span>
          </div>
        ) : (
          <>
            {showLive && (
              <Group label="◉ LIVE" tone="green">
                {groups.live.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} live />
                ))}
              </Group>
            )}

            {showBuckets.map((b) => (
              <Group key={b.label} label={b.label.toUpperCase()}>
                {b.items.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} />
                ))}
              </Group>
            ))}

            {showShared && (
              <Group label="🔗 SHARED WITH ME">
                {groups.shared.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} shared />
                ))}
              </Group>
            )}

            {empty && (
              <div
                className="label"
                style={{ color: "var(--faint)", padding: "18px 6px", lineHeight: 1.6 }}
              >
                {needle ? "NO MATCHES" : "NO SESSIONS YET"}
                {!needle && tab === "all" && (
                  <div style={{ marginTop: 8, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                    Run{" "}
                    <code style={{ color: "var(--green)" }}>live claude</code>{" "}
                    to start one.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {user?.is_admin && (
        <Link href="/admin" className="ws-admin-link">
          <span aria-hidden>★</span> ADMIN
        </Link>
      )}

      <div className="ws-profile-footer">
        <Link href="/profile" className="ws-profile-link">
          <Avatar
            seed={user?.id ?? user?.email ?? user?.name}
            size={28}
            rounded={false}
            className="ws-profile-avatar"
            title={user?.name ?? user?.email ?? "Account"}
          />
          <span className="ws-profile-info">
            <span className="ws-profile-name">
              {user?.name ?? user?.email ?? "Account"}
            </span>
            {user?.email && (
              <span className="ws-profile-email">{user.email}</span>
            )}
          </span>
        </Link>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="ws-signout"
          title="Sign out"
          aria-label="Sign out"
        >
          {signingOut ? "…" : "⎋"}
        </button>
      </div>
    </div>
  );
}

function Group({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "green";
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        className="label"
        style={{
          padding: "4px 8px",
          color: tone === "green" ? "var(--green)" : "var(--faint)",
          fontSize: 9,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {children}
      </div>
    </div>
  );
}

/** One session row, in the v3 rail's shape: swatch (with a live pip), title over
 *  a sub-line, and a right-aligned status/age. See designs/version3 `.sb-row`. */
function Row({
  s,
  active,
  live,
  shared,
}: {
  s: Session;
  active: boolean;
  live?: boolean;
  shared?: boolean;
}) {
  return (
    <Link
      href={`/session/${s.id}`}
      title={s.title || "untitled session"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 8px",
        borderLeft: `2px solid ${active ? "var(--green)" : "transparent"}`,
        background: active ? "var(--panel2)" : "transparent",
        minWidth: 0,
      }}
      className="ws-row"
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          flexShrink: 0,
          width: 26,
          height: 26,
          background: "var(--grad-hero)",
          border: "1px solid var(--hairline)",
        }}
      >
        {live && (
          <span
            className="live-dot"
            style={{
              position: "absolute",
              right: -3,
              bottom: -3,
              boxShadow: "0 0 0 2px var(--panel)",
            }}
          />
        )}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12,
            color: active ? "var(--ink)" : "var(--muted)",
            fontWeight: active ? 600 : 400,
          }}
        >
          {s.title || "untitled session"}
        </span>
        <span
          style={{
            fontSize: 9.5,
            color: "var(--faint)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shared ? `@${s.owner_handle}` : s.model || "—"}
        </span>
      </span>
      <span
        className="label"
        style={{
          flexShrink: 0,
          color: live ? "var(--green)" : "var(--faint)",
          fontSize: 9,
        }}
      >
        {live ? "LIVE" : timeAgo(s.ended_at ?? s.created_at)}
      </span>
    </Link>
  );
}
