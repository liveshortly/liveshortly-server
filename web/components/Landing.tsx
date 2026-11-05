"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FeedCard from "@/components/FeedCard";
import Topbar from "@/components/Topbar";
import SiteFooter from "@/components/SiteFooter";
import InstallCommand from "@/components/InstallCommand";
import Button from "@/components/ui/Button";
import ReplayCard from "@/components/landing/ReplayCard";
import type { Replay } from "@/components/landing/replay";
import s from "@/components/landing/Landing.module.css";
import {
  getFeed,
  getLiveFeed,
  loginUrl,
  publicStats,
  type PublicStats,
  type Session,
} from "@/lib/api";
import { INSTALL_CMD } from "@/lib/install";
import { fmtInt } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;
const RECENT_LIMIT = 24;
const RECENT_SHOWN = 8;
const GITHUB_URL = "https://github.com/liveshortly/live";

/** Server-fetched first paint for the live strip, recent feed, counts and the
 *  hero replay. */
export type LandingData = {
  live: Session[];
  recent: Session[];
  stats: PublicStats | null;
  replay?: Replay | null;
};

/** Full-page landing view for anonymous visitors: what LiveShortly is, a real
 *  public session, then the real public feed. Every number and row on this
 *  page comes from the API; nothing is fabricated, and nothing empty or zero
 *  is shown. */
export default function Landing({ initial }: { initial?: LandingData }) {
  return (
    <Suspense
      fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)" }} />}
    >
      <LandingInner initial={initial} />
    </Suspense>
  );
}

function LandingInner({ initial }: { initial?: LandingData }) {
  const params = useSearchParams();
  const authFailed = params.has("auth_error");

  const [live, setLive] = useState<Session[]>(initial?.live ?? []);
  const [recent, setRecent] = useState<Session[]>(initial?.recent ?? []);
  const [stats, setStats] = useState<PublicStats | null>(initial?.stats ?? null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Session[] | null>(null);

  const signIn = () => {
    // Full-page navigation — NOT fetch — so Google OAuth can run.
    window.location.href = loginUrl();
  };

  // Only when rendered without server data.
  useEffect(() => {
    if (initial) return;
    const ctrl = new AbortController();
    (async () => {
      const [l, r, st] = await Promise.allSettled([
        getLiveFeed(12, ctrl.signal),
        getFeed({ limit: RECENT_LIMIT }, ctrl.signal),
        publicStats(ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      if (l.status === "fulfilled") setLive(l.value.results);
      if (r.status === "fulfilled") setRecent(r.value.results);
      if (st.status === "fulfilled") setStats(st.value);
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced feed search. An empty query drops back to the curated sections.
  const reqId = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const my = ++reqId.current;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const page = await getFeed({ q, limit: RECENT_LIMIT }, ctrl.signal);
        if (my === reqId.current) setResults(page.results);
      } catch {
        if (my === reqId.current) setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const searching = results !== null;
  const liveOwners = useMemo(
    () => [...new Set(live.map((x) => x.owner_handle))].slice(0, 3),
    [live],
  );

  // The shared header + footer (LSW-03); the feed search moved from the old
  // landing topbar into the page, above the feed sections.
  return (
    <>
      <Topbar user={null} />
      <main id="main" className="lp-main">
        <div className="lp-main-inner">
          {authFailed && (
            <div
              role="alert"
              style={{
                border: "1px solid var(--red)",
                color: "var(--red)",
                padding: "10px 14px",
                marginBottom: 18,
                fontSize: 13,
              }}
            >
              Sign-in failed. Try again.
            </div>
          )}

          <Hero
            onSignIn={signIn}
            liveCount={live.length}
            replay={initial?.replay ?? null}
            latest={recent[0] ?? null}
          />

          <ul className={s.points}>
            {PROOF_POINTS.map(([h, d]) => (
              <li key={h}>
                <strong>{h}</strong> {d}
              </li>
            ))}
          </ul>

          <Proof stats={stats} liveOwners={liveOwners} liveCount={live.length} />

          <div className={`lp-searchpill ${s.search}`} role="search">
            <span aria-hidden>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions, owners, tags…"
              aria-label="Search published sessions"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--faint)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {searching ? (
            <>
              <div className="lp-sec-head">
                <h2 className="lp-sec-title">⌕ Results · {query.trim()}</h2>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="lp-sec-link"
                  style={{ border: "none", background: "none", cursor: "pointer" }}
                >
                  Clear ✕
                </button>
              </div>
              {results.length > 0 ? (
                <CardGrid sessions={results} />
              ) : (
                <div className="lp-empty">
                  No published sessions match “{query.trim()}”
                </div>
              )}
            </>
          ) : (
            <>
              {live.length > 0 && (
                <section id="live-now">
                  <div className="lp-sec-head">
                    <h2 className="lp-sec-title live">◉ Live now</h2>
                    <Link href="/feed" className="lp-sec-link">
                      See all →
                    </Link>
                  </div>
                  <CardGrid sessions={live} />
                </section>
              )}

              {recent.length > 0 && (
                <section>
                  <div className="lp-sec-head">
                    <h2 className="lp-sec-title">Recently published</h2>
                    <Link href="/feed" className="lp-sec-link">
                      See all →
                    </Link>
                  </div>
                  <CardGrid sessions={recent.slice(0, RECENT_SHOWN)} />
                </section>
              )}
            </>
          )}

          <HowItWorks />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Hero — static pitch + CTA on the left, a real public session on the right.
   ──────────────────────────────────────────────────────────────────────── */

const PROOF_POINTS = [
  ["Any agent, one link.", "Claude Code, Codex, Gemini CLI, Antigravity, pi, Ollama."],
  ["Comment into the session.", "Viewer comments reach the agent, not just the page."],
  ["Approve from your phone.", "Permission prompts show up in the PocketAI app: allow or deny from anywhere."],
  ["Replay and hand off.", "Every session is recorded; replay it, or give another agent the full context."],
] as const;

function Hero({
  onSignIn,
  liveCount,
  replay,
  latest,
}: {
  onSignIn: () => void;
  liveCount: number;
  replay: Replay | null;
  latest: Session | null;
}) {
  // A real replay; else the newest real published session; else nothing.
  const side = replay ? (
    <ReplayCard replay={replay} />
  ) : latest ? (
    <div style={{ minWidth: 0 }}>
      <div className={s.sideLabel}>Latest published session</div>
      <FeedCard session={latest} />
    </div>
  ) : null;

  return (
    <div className={`lp-mkt-hero${side ? "" : ` ${s.heroSolo}`}`}>
      <div style={{ minWidth: 0 }}>
        {liveCount > 0 && (
          <div className="lp-mkt-eyebrow">
            <span className="live-dot" aria-hidden />
            {liveCount} session{liveCount === 1 ? "" : "s"} live now
          </div>
        )}
        <h1 className={`lp-mkt-title ${s.title}`}>
          Watch, steer and share your coding agent, live
        </h1>
        <p className={s.sub}>
          Run Claude Code, Codex, Gemini CLI and more as usual. LiveShortly
          streams every prompt, tool call and file edit to a link. Teammates
          watch and comment in real time, you approve permission prompts from
          your phone, and anyone can replay the session later.
        </p>

        <div className="lp-cta">
          <Button variant="prominent" onClick={onSignIn} title="Sign in with Google">
            Start streaming
          </Button>
          <Link href="/feed">See a live session</Link>
        </div>

        <div className={s.install}>
          <span className={s.installLabel}>Start in 30 seconds</span>
          <InstallCommand command={INSTALL_CMD} />
        </div>

        <div className={s.links}>
          <Link href="/install">Install guide</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <Link href="/install/self-host">Self-host it</Link>
        </div>
      </div>

      {side}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Proof strip — real aggregate counts (zeros hidden) + who is streaming.
   ──────────────────────────────────────────────────────────────────────── */

function Proof({
  stats,
  liveOwners,
  liveCount,
}: {
  stats: PublicStats | null;
  liveOwners: string[];
  liveCount: number;
}) {
  const items = stats
    ? (
        [
          [stats.total_sessions, "Sessions streamed"],
          [stats.published, "Published"],
          [stats.total_views, "Views"],
          [stats.creators, "Creators"],
        ] as const
      ).filter(([v]) => v > 0)
    : [];
  if (items.length === 0 && liveOwners.length === 0) return null;

  return (
    <div className="lp-proof">
      {items.map(([v, l], i) => (
        <div key={l} style={{ display: "contents" }}>
          {i > 0 && <div className="lp-proof-sep" />}
          <div className="lp-proof-stat">
            <span className="v tnum">{fmtInt(v)}</span>
            <span className="l">{l}</span>
          </div>
        </div>
      ))}

      {liveOwners.length > 0 && (
        <div className="lp-proof-watch">
          <span className="lp-proof-watch-label">
            {joinHandles(liveOwners)} streaming now
            {liveCount > liveOwners.length ? " · and more" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function CardGrid({ sessions }: { sessions: Session[] }) {
  return (
    <div className="lp-grid">
      {sessions.map((x) => (
        <FeedCard key={x.id} session={x} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   How it works — install → run → share, each with its command and output.
   ──────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section className="lp-how-wrap" aria-labelledby="how">
      <div className="lp-sec-head">
        <h2 id="how" className="lp-sec-title">
          How it works
        </h2>
      </div>
      <ol className="lp-how" style={{ listStyle: "none", padding: 0, margin: "18px 0 0" }}>
        <li className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">1</span>
            <h3 className="lp-how-h">Install the CLI</h3>
          </div>
          <div className="lp-how-d">
            One command puts <code>live</code> on your PATH. macOS and Linux
            (Windows via WSL).
          </div>
          <div style={{ marginTop: 12 }}>
            <InstallCommand command={INSTALL_CMD} />
          </div>
          <p className={s.out}>installed → /usr/local/bin/live</p>
        </li>

        <li className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">2</span>
            <h3 className="lp-how-h">Sign in and run your agent</h3>
          </div>
          <div className="lp-how-d">
            Sign in once (the <Link href="/install">install guide</Link> has
            the one-time setup), then start your agent through{" "}
            <code>live</code>.
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <InstallCommand command="live login" />
            <InstallCommand command="live claude" />
          </div>
          <p className={s.out}>● live streaming → …/session/…</p>
        </li>

        <li className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">3</span>
            <h3 className="lp-how-h">Share or publish</h3>
          </div>
          <div className="lp-how-d">
            Sessions start private. Send the link to a teammate, open it to
            anyone with the link, or publish it to the public feed. Viewers
            can comment while it runs, and it stays as a replay afterwards.
          </div>
        </li>
      </ol>

      {/* The daemon is the one feature nobody discovers on their own: the UI
          that would advertise it (the "+ New session" button) only appears once
          a machine is connected. This is where they find out it exists. */}
      <div className="lp-daemon">
        <div className="lp-daemon-copy">
          <h3 className="lp-daemon-title">Or start sessions from the browser</h3>
          <p className="lp-daemon-d">
            Leave <code>live daemon</code> running and <b>New session</b>{" "}
            appears on the site. Pick the machine, the agent and the directory,
            and it starts a real run there, with the same permission prompts as
            in your terminal. Take it over locally at any time.
          </p>
          <div className="lp-daemon-note">
            Only the directories you name can be used. Your machine builds the
            command; the server only names an agent.
          </div>
        </div>
        <div className="lp-daemon-cmds">
          <InstallCommand command="live daemon --dir ~/code" />
          <div className="lp-daemon-cmd-note">
            repeat <code>--dir</code> to offer more directories
          </div>
        </div>
      </div>
    </section>
  );
}

function joinHandles(handles: string[]): string {
  const hs = handles.map((h) => `@${h}`);
  if (hs.length === 1) return hs[0];
  return `${hs.slice(0, -1).join(", ")} & ${hs[hs.length - 1]}`;
}
