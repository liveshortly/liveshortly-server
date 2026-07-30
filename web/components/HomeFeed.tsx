"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
type HomeTab = "feed" | "live" | "published";

export default function HomeFeed() {
  const [items, setItems] = useState<Session[] | null>(null);
  const [statsData, setStatsData] = useState<Stats | null>(null);
  // Active tab comes from the URL (?tab=) so the header tabs — which live in
  // the global Topbar and navigate here — drive which section shows.
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: HomeTab =
    raw === "live" || raw === "published" ? raw : "feed";

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

  // Gate on stats so a brand-new user (never created a session) sees the
  // minimal onboarding rather than a flash of the busy public feed.
  if (statsData === null) {
    return (
      <div className="v3-page-wrap">
        <div className="v3-page-main">
          <div className="v3-empty">LOADING…</div>
        </div>
      </div>
    );
  }
  // First-run onboarding takes over the Feed tab for a zero-session user; the
  // Live / Published tabs still let them browse the public feed.
  if (statsData.total_sessions === 0 && tab === "feed") {
    return <Onboarding />;
  }

  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        {tab === "feed" && items !== null && <Hero session={featured} />}

        {tab === "live" &&
          (items === null ? (
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
          ))}

        {tab === "published" &&
          (items === null ? (
            <div className="v3-empty">LOADING…</div>
          ) : recent.length > 0 ? (
            <div className="hf-grid">
              {recent.slice(0, RECENT_SHOWN).map((s) => (
                <FeedCard key={s.id} session={s} />
              ))}
            </div>
          ) : (
            <div className="v3-empty">
              NO PUBLISHED SESSIONS YET — PUBLISH ONE FROM YOUR HUD
            </div>
          ))}
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

/**
 * Inline first-run onboarding — shown only when the signed-in user has never
 * created a session (stats.total_sessions === 0). Minimal by design: get them
 * to install the CLI and stream their first session, which then replaces this.
 */
function Onboarding() {
  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        <div className="ob-wrap">
          <div className="v3-eyebrow">◈ Get started</div>
          <h1 className="ob-title">Stream your first session</h1>
          <p className="ob-sub">
            LiveShortly turns any Claude Code session into a live, replayable,
            shareable feed. Install the CLI and wrap Claude with{" "}
            <code>live</code> — your sessions show up right here.
          </p>

          <ol className="ob-steps">
            <li>
              <span className="ob-step-n tnum">01</span>
              <div className="ob-step-body">
                <div className="ob-step-t">Install the CLI</div>
                <CopyCmd cmd="curl -fsSL https://liveshortly.com/i.sh | bash" />
              </div>
            </li>
            <li>
              <span className="ob-step-n tnum">02</span>
              <div className="ob-step-body">
                <div className="ob-step-t">Run a session</div>
                <CopyCmd cmd="live claude" />
                <div className="ob-step-s">
                  Sign in once with <code>live login</code>, then{" "}
                  <code>live claude</code> wraps Claude Code and opens a session.
                </div>
              </div>
            </li>
            <li>
              <span className="ob-step-n tnum">03</span>
              <div className="ob-step-body">
                <div className="ob-step-t">Watch it here</div>
                <div className="ob-step-s">
                  Your session streams live and lands in this space — share a
                  private link or publish it to the public feed.
                </div>
              </div>
            </li>
            {/* The "+ New session" button only renders once a machine is
                connected, so a first-run user would never learn the daemon
                exists. Say it here, where they still have a terminal open. */}
            <li>
              <span className="ob-step-n tnum">04</span>
              <div className="ob-step-body">
                <div className="ob-step-t">Optional · start from the browser</div>
                <CopyCmd cmd="live daemon" />
                <div className="ob-step-s">
                  Leave it running in a project and a{" "}
                  <strong>+ New session</strong> button appears up top — pick a
                  machine, an agent and a directory, and the run starts there. No
                  terminal needed after that.
                </div>
              </div>
            </li>
          </ol>

          <Link href="/install" className="ob-guide-link">
            Full install guide →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ob-cmd">
      <code>
        <span className="ob-cmd-prompt">$</span> {cmd}
      </code>
      <button
        type="button"
        className="ob-cmd-copy"
        onClick={() => {
          navigator.clipboard?.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
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
