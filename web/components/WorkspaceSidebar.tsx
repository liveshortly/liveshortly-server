"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Badge from "@/components/Badge";
import { listSessions, type Session } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const POLL_MS = 5000;

/**
 * ChatGPT-style session list. Lives in the workspace layout so it persists as
 * the user navigates between the HUD and individual sessions. Groups the user's
 * own sessions (LIVE pinned, then archived by recency) plus a "shared with me"
 * section, with a search filter. Each row links to /session/{id}.
 */
export default function WorkspaceSidebar() {
  const pathname = usePathname() || "";
  const activeId = pathname.startsWith("/session/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : null;

  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [q, setQ] = useState("");

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

  return (
    <div className="ws-sidebar-inner">
      {/* Search */}
      <div style={{ padding: "10px 10px 6px" }}>
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
            {groups.live.length > 0 && (
              <Group label="◉ LIVE" tone="green">
                {groups.live.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} live />
                ))}
              </Group>
            )}

            {groups.buckets.map((b) => (
              <Group key={b.label} label={b.label.toUpperCase()}>
                {b.items.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} />
                ))}
              </Group>
            ))}

            {groups.shared.length > 0 && (
              <Group label="🔗 SHARED WITH ME">
                {groups.shared.map((s) => (
                  <Row key={s.id} s={s} active={s.id === activeId} shared />
                ))}
              </Group>
            )}

            {groups.live.length === 0 &&
              groups.buckets.length === 0 &&
              groups.shared.length === 0 && (
                <div
                  className="label"
                  style={{ color: "var(--faint)", padding: "18px 6px", lineHeight: 1.6 }}
                >
                  {needle ? "NO MATCHES" : "NO SESSIONS YET"}
                  {!needle && (
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
        gap: 8,
        padding: "8px 8px",
        borderLeft: `2px solid ${active ? "var(--green)" : "transparent"}`,
        background: active ? "var(--panel)" : "transparent",
        minWidth: 0,
      }}
      className="ws-row"
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 7,
          height: 7,
          borderRadius: 9999,
          background: live ? "var(--green)" : "var(--faint)",
        }}
        className={live ? "live-dot" : undefined}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13,
          color: active ? "var(--ink)" : "var(--muted)",
          fontWeight: active ? 600 : 400,
        }}
      >
        {s.title || "untitled session"}
      </span>
      <span className="label" style={{ flexShrink: 0, color: "var(--faint)", fontSize: 9 }}>
        {live ? "LIVE" : timeAgo(s.ended_at ?? s.created_at)}
      </span>
    </Link>
  );
}
