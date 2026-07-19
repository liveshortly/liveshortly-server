"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ShareDialog from "@/components/ShareDialog";
import PublishAction from "@/components/PublishAction";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import SessionStatusDot from "@/components/SessionStatusDot";
import {
  activity as fetchActivity,
  listSessions,
  type ActivityItem,
  type Session,
} from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const POLL_MS = 5000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Pixel match of designs/version3/hud.html — resume hero, Live/Archive/
 *  Shared-with-me row lists, and a right rail of real weekly stats,
 *  personal activity, model usage and top tags. */
export default function Page() {
  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  const [shareFor, setShareFor] = useState<Session | null>(null);

  const updateMine = (u: Session) =>
    setMine((cur) => (cur ? cur.map((s) => (s.id === u.id ? { ...s, ...u } : s)) : cur));
  const removeMine = (id: string) =>
    setMine((cur) => (cur ? cur.filter((s) => s.id !== id) : cur));

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const [m, s] = await Promise.all([
          listSessions({ scope: "mine", status: "all", limit: 200 }),
          listSessions({ scope: "shared", status: "all", limit: 100 }),
        ]);
        if (alive) {
          setMine(m.results);
          setShared(s.results);
          setMineErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setMineErr("Could not load your sessions.");
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const a = await fetchActivity(ctrl.signal);
        if (!ctrl.signal.aborted) setItems(a);
      } catch {
        // leave activity blank on a transient error
      }
    })();
    return () => ctrl.abort();
  }, []);

  const live = useMemo(() => (mine ?? []).filter((s) => s.status === "live"), [mine]);
  const archive = useMemo(
    () =>
      (mine ?? [])
        .filter((s) => s.status !== "live")
        .sort(
          (a, b) =>
            +new Date(b.ended_at ?? b.created_at) - +new Date(a.ended_at ?? a.created_at),
        ),
    [mine],
  );

  // "This week" rolls up the already-fetched "mine" list — no separate endpoint.
  const week = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    const recent = (mine ?? []).filter((s) => +new Date(s.created_at) >= cutoff);
    return {
      sessions: recent.length,
      events: recent.reduce((n, s) => n + s.event_count, 0),
      published: recent.filter(
        (s) => s.published_at && +new Date(s.published_at) >= cutoff,
      ).length,
      views: recent.reduce((n, s) => n + s.view_count, 0),
    };
  }, [mine]);

  const modelUsage = useMemo(() => rollupModels(mine ?? []), [mine]);
  const topTags = useMemo(() => rollupTags(mine ?? []), [mine]);

  const ownerActions = (s: Session) => (
    <div className="hud-row-icons">
      <PublishAction session={s} onChanged={updateMine} />
      <ShareAction
        session={s}
        open={shareFor?.id === s.id}
        onToggle={() => setShareFor((cur) => (cur?.id === s.id ? null : s))}
        onClose={() => setShareFor(null)}
      />
      <DeleteSessionButton id={s.id} onDeleted={() => removeMine(s.id)} compact />
    </div>
  );

  const resumeSession = live[0] ?? null;
  const loaded = mine !== null;

  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        <div className="v3-eyebrow">⌂ My HUD</div>

        {resumeSession ? (
          <Link href={`/session/${resumeSession.id}`} className="hud-hero" style={{ textDecoration: "none" }}>
            <div className="hud-hero-text">
              <div className="hk">Continue where you left off</div>
              <div className="ht">{resumeSession.title || "untitled session"}</div>
              <div className="hs">
                Started {timeAgo(resumeSession.created_at)} · {fmtInt(resumeSession.event_count)} events
              </div>
              {resumeSession.hero && (
                <div className="hud-hero-snippet">
                  <span className="glyph">▸</span>
                  {resumeSession.hero}
                </div>
              )}
            </div>
            <span className="hud-hero-cta">▶ Resume watching</span>
          </Link>
        ) : (
          loaded && (
            <div className="hud-idle">
              No live session right now. Run <code>live claude</code> to start
              streaming — it shows up here the moment it goes live.
            </div>
          )
        )}

        {mineErr && <ErrorBar text={mineErr} />}

        {live.length > 0 && (
          <>
            <div className="v3-sec-head">
              <span className="v3-sec-title live">◉ Live ({live.length})</span>
            </div>
            <div className="hud-rows">
              {live.map((s) => (
                <Row key={s.id} session={s} actions={ownerActions(s)} />
              ))}
            </div>
          </>
        )}

        <div className="v3-sec-head">
          <span className="v3-sec-title">Archive</span>
        </div>
        {!loaded ? (
          <div className="v3-empty">LOADING…</div>
        ) : archive.length > 0 ? (
          <div className="hud-rows">
            {archive.map((s) => (
              <Row key={s.id} session={s} actions={ownerActions(s)} />
            ))}
          </div>
        ) : (
          <div className="v3-empty">
            NO ARCHIVED SESSIONS YET — RUN <code>live claude</code> TO START ONE
          </div>
        )}

        {(shared === null || shared.length > 0) && (
          <>
            <div className="v3-sec-head">
              <span className="v3-sec-title">🔗 Shared with me</span>
            </div>
            {shared === null ? (
              <div className="v3-empty">LOADING…</div>
            ) : (
              <div className="hud-rows">
                {shared.map((s) => (
                  <Row key={s.id} session={s} shared />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="v3-page-rightpanel">
        <div className="v3-rp-title">This week</div>
        <div className="v3-rp-stat-grid">
          <Stat value={week.sessions} label="Sessions" />
          <Stat value={week.events} label="Events" />
          <Stat value={week.published} label="Published" />
          <Stat value={week.views} label="Views" accent />
        </div>

        <div className="v3-rp-title" style={{ marginTop: 26 }}>
          Recent Activity
        </div>
        {items === null ? (
          <div className="v3-empty" style={{ padding: "12px 0" }}>
            LOADING…
          </div>
        ) : items.length === 0 ? (
          <div className="v3-empty" style={{ padding: "12px 0" }}>
            NO ACTIVITY YET
          </div>
        ) : (
          items.map((it, i) => <ActivityRow key={i} item={it} />)
        )}

        {modelUsage.length > 0 && (
          <>
            <div className="v3-rp-title" style={{ marginTop: 26 }}>
              Model Usage
            </div>
            {modelUsage.map(([model, pct]) => (
              <div className="hud-rp-bar-row" key={model}>
                <div className="hud-rp-bar-label">
                  <span>{model}</span>
                  <span className="tnum">{pct}%</span>
                </div>
                <div className="hud-rp-bar-track">
                  <div className="hud-rp-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </>
        )}

        {topTags.length > 0 && (
          <>
            <div className="v3-rp-title" style={{ marginTop: 26 }}>
              Top tags
            </div>
            <div>
              {topTags.map(([tag]) => (
                <span className="hud-rp-tag" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({
  session,
  actions,
  shared,
}: {
  session: Session;
  actions?: React.ReactNode;
  shared?: boolean;
}) {
  const live = session.status === "live";
  return (
    <div className="hud-row">
      <Link href={`/session/${session.id}`} className="hud-row-link">
        <SessionStatusDot s={session} shared={shared} live={live} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hud-row-title">{session.title || "untitled session"}</div>
          <div className="hud-row-sub">
            {shared
              ? `@${session.owner_handle} · ${session.shared_role ?? "viewer"} access`
              : `${session.model ?? "—"} · ${
                  live ? "started" : "ended"
                } ${timeAgo(live ? session.created_at : (session.ended_at ?? session.created_at))} ago`}
          </div>
        </div>
        <span className={`hud-row-badge${live ? " live" : ""}`}>
          {live && <span className="live-dot" />}
          {live ? "Live" : "Ended"}
        </span>
        <div className="hud-row-events tnum">{fmtInt(session.event_count)} ev</div>
      </Link>
      {actions}
    </div>
  );
}

function ShareAction({
  session,
  open,
  onToggle,
  onClose,
}: {
  session: Session;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <span style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className="hud-rbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          background: open ? "var(--strong)" : "transparent",
          color: open ? "var(--panel)" : "var(--ink)",
        }}
      >
        ⊕ Share
      </button>
      {open && (
        <ShareDialog
          sessionId={session.id}
          title={session.title}
          anchorEl={btnRef.current}
          onClose={onClose}
        />
      )}
    </span>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="v3-rp-stat">
      <div className="v tnum" style={accent ? { color: "var(--green)" } : undefined}>
        {fmtInt(value)}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const dot =
    item.kind === "went_live"
      ? "var(--green)"
      : item.kind === "share"
        ? "var(--admin)"
        : "var(--faint)";
  return (
    <div className="hud-rp-activity-row">
      <span className="hud-rp-activity-dot" style={{ background: dot }} />
      <div>
        <div className="hud-rp-activity-text">
          <ActivityText item={item} />
        </div>
        <div className="hud-rp-activity-time">{timeAgo(item.ts)}</div>
      </div>
    </div>
  );
}

function ActivityText({ item }: { item: ActivityItem }) {
  const title = <b>{item.session_title || "untitled session"}</b>;
  switch (item.kind) {
    case "went_live":
      return <>You went live — {title}</>;
    case "published":
      return <>You published — {title}</>;
    case "comment":
      return (
        <>
          <b>@{item.actor}</b> commented on {title}
        </>
      );
    case "share":
      return (
        <>
          <b>@{item.actor}</b> shared {title} with you
        </>
      );
  }
}

function ErrorBar({ text }: { text: string }) {
  return (
    <div
      className="label"
      style={{
        border: "1px solid var(--red)",
        color: "var(--red)",
        padding: "8px 12px",
        marginBottom: 20,
      }}
    >
      ⚠ {text}
    </div>
  );
}

/** Model distribution across all of the caller's own sessions, as percentages
 *  (rounded, so they may not sum to exactly 100). */
function rollupModels(sessions: Session[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of sessions) if (s.model) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...counts.entries()]
    .map<[string, number]>(([model, n]) => [model, Math.round((n / total) * 100)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function rollupTags(sessions: Session[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}
