"use client";

import { useEffect, useMemo, useState } from "react";
import { activity as fetchActivity, type ActivityItem, type Session } from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "This week" stats + recent activity + model usage + top tags rail —
 * designs/version3/hud.html `.rightpanel` (also reused verbatim by
 * designs/version4/sessions/index.html). Owns its own activity poll; the
 * caller only supplies its own sessions (for the week/model/tag rollups).
 */
export default function SessionsRightRail({ mine }: { mine: Session[] | null }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

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

  // "This week" rolls up the caller's already-fetched session list — no separate endpoint.
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

  return (
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
