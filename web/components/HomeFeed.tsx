"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FeedCard from "@/components/FeedCard";
import {
  getFeed,
  stats as fetchStats,
  type Session,
  type Stats,
} from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const FEED_LIMIT = 48;
const RECENT_SHOWN = 10;

/**
 * Authenticated home page — pixel match of designs/version3/feed.html: hero
 * (trending/featured session), Live Now + Recently Published grids, and a
 * right panel with real platform stats. "Watching now" and "Recent Activity"
 * from the mockup are dropped — nothing backs named viewers or a global
 * activity log today. The hero also skips the mockup's live watcher count:
 * the only endpoint that carries it (GET /api/sessions/{id}) increments
 * view_count as a side effect, so polling it just to read a number would
 * inflate real view counts.
 */
export default function HomeFeed() {
  const [items, setItems] = useState<Session[] | null>(null);
  const [statsData, setStatsData] = useState<Stats | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const page = await getFeed({ limit: FEED_LIMIT }, ctrl.signal);
        if (!ctrl.signal.aborted) setItems(page.results);
      } catch {
        if (!ctrl.signal.aborted) setItems([]);
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const s = await fetchStats(ctrl.signal);
        if (!ctrl.signal.aborted) setStatsData(s);
      } catch {
        // leave stats blank on a transient error
      }
    })();
    return () => ctrl.abort();
  }, []);

  const live = useMemo(
    () => (items ?? []).filter((s) => s.status === "live"),
    [items],
  );

  const featured = useMemo<Session | null>(() => {
    if (!items) return null;
    if (live.length > 0) return live[0];
    if (items.length > 0)
      return [...items].sort((a, b) => b.view_count - a.view_count)[0];
    return null;
  }, [items, live]);

  const recent = useMemo(
    () => (items ?? []).filter((s) => s.id !== featured?.id),
    [items, featured],
  );

  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        <div className="v3-eyebrow">◈ Feed</div>

        {items !== null && <Hero session={featured} />}

        <div className="v3-sec-head">
          <span className="v3-sec-title live">◉ Live now</span>
          {live.length > 0 && (
            <span className="v3-sec-link">{live.length} streaming</span>
          )}
        </div>
        {items === null ? (
          <div className="v3-empty">LOADING…</div>
        ) : live.length > 0 ? (
          <div className="hf-grid">
            {live.map((s) => (
              <FeedCard key={s.id} session={s} />
            ))}
          </div>
        ) : (
          <div className="v3-empty">
            NO LIVE SESSIONS RIGHT NOW — START ONE FROM YOUR TERMINAL
          </div>
        )}

        <div className="v3-sec-head">
          <span className="v3-sec-title">Recently published</span>
          <Link href="/feed" className="v3-sec-link">
            See all →
          </Link>
        </div>
        {items === null ? (
          <div className="v3-empty">LOADING…</div>
        ) : recent.length > 0 ? (
          <div className="hf-grid">
            {recent.slice(0, RECENT_SHOWN).map((s) => (
              <FeedCard key={s.id} session={s} />
            ))}
          </div>
        ) : (
          !featured && (
            <div className="v3-empty">
              NO PUBLISHED SESSIONS YET — PUBLISH ONE FROM YOUR HUD
            </div>
          )
        )}
      </div>

      <aside className="v3-page-rightpanel">
        <div className="v3-rp-title">Platform stats</div>
        <div className="v3-rp-stat-grid">
          <div className="v3-rp-stat">
            <div className="v tnum">
              {statsData ? fmtInt(statsData.total_sessions) : "··"}
            </div>
            <div className="l">Total sessions</div>
          </div>
          <div className="v3-rp-stat">
            <div className="v tnum" style={{ color: "var(--green)" }}>
              {statsData ? fmtInt(statsData.live_now) : "··"}
            </div>
            <div className="l">Live now</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Hero({ session }: { session: Session | null }) {
  if (!session) {
    return (
      <div className="hf-hero">
        <div className="hf-hero-badge">◉</div>
        <div className="hf-hero-text">
          <div className="hk">LiveShortly</div>
          <div className="ht">
            Stream your Claude Code sessions — live, replayable, shareable.
          </div>
          <div className="hs">
            Nothing published yet. Run a session with the capture hooks
            installed, then publish it for anyone to watch or replay.
          </div>
        </div>
      </div>
    );
  }

  const live = session.status === "live";
  return (
    <Link href={`/session/${session.id}`} className="hf-hero">
      <div className="hf-hero-badge">◉</div>
      <div className="hf-hero-text">
        <div className="hk">
          {live ? "Trending right now" : "★ Featured session"}
        </div>
        <div className="ht">{session.title || "untitled session"}</div>
        <div className="hs">
          @{session.owner_handle}
          {session.model && <> · {session.model}</>} ·{" "}
          {fmtInt(session.event_count)} events
        </div>
        {session.hero && (
          <div className="hf-hero-snippet">
            <span className="glyph">▸</span>
            {session.hero}
            <span className="tnum" style={{ opacity: 0.7 }}>
              {" "}
              · {timeAgo(session.published_at ?? session.created_at)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
