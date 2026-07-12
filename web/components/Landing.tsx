"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import Avatar from "@/components/Avatar";
import {
  getFeed,
  getLiveFeed,
  loginUrl,
  publicStats,
  type PublicStats,
  type Session,
} from "@/lib/api";
import { fmtInt } from "@/lib/utils";

const INSTALL_CMD = "curl -fsSL https://liveshortly.com/i.sh | bash";
const LOGIN_CMD = "live login";
const RUN_CMD = "live claude";
const TYPEWRITER_WORDS = ["write software", "collab", "blog"];
const SEARCH_DEBOUNCE_MS = 300;
const RECENT_LIMIT = 24;
const RECENT_SHOWN = 8;

/** Full-page landing view for anonymous visitors: the v3 browse shell — product
 *  pitch and a looping demo on the right, the real public feed underneath, and
 *  a persistent sidebar of what's live, who's publishing and which tags run hot.
 *  Every number and row on this page comes from the API; nothing is fabricated. */
export default function Landing() {
  return (
    <Suspense
      fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)" }} />}
    >
      <LandingInner />
    </Suspense>
  );
}

function LandingInner() {
  const params = useSearchParams();
  const authFailed = params.has("auth_error");

  const [live, setLive] = useState<Session[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Session[] | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const signIn = () => {
    // Full-page navigation — NOT fetch — so Google OAuth can run.
    window.location.href = loginUrl();
  };

  // Live strip, recent feed page and the proof counts, all in one shot.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const [l, r, s] = await Promise.allSettled([
        getLiveFeed(12, ctrl.signal),
        getFeed({ limit: RECENT_LIMIT }, ctrl.signal),
        publicStats(ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      if (l.status === "fulfilled") setLive(l.value.results);
      if (r.status === "fulfilled") setRecent(r.value.results);
      if (s.status === "fulfilled") setStats(s.value);
      setLoaded(true);
    })();
    return () => ctrl.abort();
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

  // Creators + tags are rolled up from the sessions actually on the feed —
  // no separate endpoint, and no number the visitor can't click through to.
  const known = useMemo(() => dedupe([...live, ...recent]), [live, recent]);
  const creators = useMemo(() => rollupCreators(known), [known]);
  const tags = useMemo(() => rollupTags(known), [known]);

  const searching = results !== null;
  const liveOwners = useMemo(
    () => [...new Set(live.map((s) => s.owner_handle))].slice(0, 3),
    [live],
  );

  const focusSearch = () => searchInput.current?.focus();

  return (
    <div className="lp-shell">
      <div className="lp-topbar">
        <span className="lp-brand">
          <BrandMark />
          LiveShortly
        </span>

        <div className="lp-searchpill">
          <span aria-hidden>⌕</span>
          <input
            ref={searchInput}
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

        <div className="lp-top-actions">
          <Link href="/install" className="lp-install-link" title="Install the CLI">
            ⇩ Install CLI
          </Link>
          <ThemeToggle />
          <button type="button" className="lp-signin-btn" onClick={signIn}>
            Sign In
          </button>
        </div>
      </div>

      <div className="lp-main">
        <div className="lp-main-inner">
          {authFailed && (
            <div
              className="label"
              style={{
                border: "1px solid var(--red)",
                color: "var(--red)",
                padding: "10px 14px",
                marginBottom: 18,
              }}
            >
              ⚠ SIGN-IN FAILED — TRY AGAIN
            </div>
          )}

          <MarketingHero onSignIn={signIn} liveCount={live.length} />

          <Proof stats={stats} liveOwners={liveOwners} liveCount={live.length} />

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
              <section id="live-now">
                <div className="lp-sec-head">
                  <h2 className="lp-sec-title live">◉ Live now</h2>
                  <Link href="/feed" className="lp-sec-link">
                    See all →
                  </Link>
                </div>
                {live.length > 0 ? (
                  <CardGrid sessions={live} />
                ) : (
                  <div className="lp-empty">
                    {loaded
                      ? "Nothing streaming right now — start a session from your terminal"
                      : "Loading…"}
                  </div>
                )}
              </section>

              {recent.length > 0 && (
                <section>
                  <div className="lp-sec-head">
                    <h2 className="lp-sec-title">▣ Recently published</h2>
                    <Link href="/feed" className="lp-sec-link">
                      See all →
                    </Link>
                  </div>
                  <CardGrid sessions={recent.slice(0, RECENT_SHOWN)} />
                </section>
              )}

              <HowItWorks />
            </>
          )}

          <Footer />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Sidebar — public browse rail. Live / Recent / Tags all read the same feed.
   ──────────────────────────────────────────────────────────────────────── */

type Tab = "live" | "recent" | "tags";

function Sidebar({
  live,
  recent,
  creators,
  tags,
  loaded,
  onSignIn,
  onSearch,
  onTag,
}: {
  live: Session[];
  recent: Session[];
  creators: Creator[];
  tags: [string, number][];
  loaded: boolean;
  onSignIn: () => void;
  onSearch: () => void;
  onTag: (tag: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("live");

  return (
    <aside className="lp-sidebar">
      <div className="lp-sb-head">
        <span className="lp-sb-title">Browse</span>
      </div>

      <div className="lp-sb-tabs" role="tablist" aria-label="Browse sessions">
        {(["live", "recent", "tags"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className="lp-sb-tab"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <button type="button" className="lp-sb-search" onClick={onSearch}>
        <span aria-hidden>⌕</span> Search sessions
      </button>

      {tab === "live" && (
        <>
          <div className="lp-sb-group-label live">
            ◉ Live now · {live.length}
          </div>
          {live.length > 0 ? (
            live.map((s) => <SessionRow key={s.id} session={s} live />)
          ) : (
            <div className="lp-sb-empty">
              {loaded ? "No sessions streaming right now." : "Loading…"}
            </div>
          )}

          {creators.length > 0 && (
            <>
              <div className="lp-sb-group-label">Trending Creators</div>
              {creators.map((c) => (
                <div key={c.handle} className="lp-sb-creator">
                  <span
                    className="lp-sb-creator-avatar"
                    style={{ background: avatarColor(c.handle) }}
                    aria-hidden
                  >
                    {initials(c.handle)}
                  </span>
                  <div className="lp-sb-creator-body">
                    <div className="lp-sb-creator-name">@{c.handle}</div>
                    <div className="lp-sb-creator-meta tnum">
                      {c.sessions} session{c.sessions === 1 ? "" : "s"} ·{" "}
                      {fmtInt(c.views)} views
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {tags.length > 0 && (
            <>
              <div className="lp-sb-group-label">Popular Tags</div>
              {tags.slice(0, 3).map(([tag, n]) => (
                <TagRow key={tag} tag={tag} count={n} onTag={onTag} />
              ))}
            </>
          )}
        </>
      )}

      {tab === "recent" && (
        <>
          <div className="lp-sb-group-label">Recently published</div>
          {recent.length > 0 ? (
            recent
              .slice(0, 12)
              .map((s) => (
                <SessionRow key={s.id} session={s} live={s.status === "live"} />
              ))
          ) : (
            <div className="lp-sb-empty">
              {loaded ? "Nothing published yet." : "Loading…"}
            </div>
          )}
        </>
      )}

      {tab === "tags" && (
        <>
          <div className="lp-sb-group-label">Popular Tags</div>
          {tags.length > 0 ? (
            tags.map(([tag, n]) => (
              <TagRow key={tag} tag={tag} count={n} onTag={onTag} />
            ))
          ) : (
            <div className="lp-sb-empty">
              {loaded ? "No tags on the feed yet." : "Loading…"}
            </div>
          )}
        </>
      )}

      <div className="lp-sb-signin">
        <button type="button" className="lp-sb-signin-btn" onClick={onSignIn}>
          Sign In
        </button>
        <div className="lp-sb-signin-sub">
          Sign in to start your own session and build your library.
        </div>
      </div>
    </aside>
  );
}

function SessionRow({ session, live }: { session: Session; live: boolean }) {
  return (
    <Link href={`/session/${session.id}`} className="lp-sb-row">
      <span className="lp-sb-swatch">{live && <span className="live-dot" />}</span>
      <span className="lp-sb-row-main">
        <span className="t">{session.title || "untitled session"}</span>
        <span className="s">
          @{session.owner_handle} · {fmtInt(session.view_count)} views
        </span>
      </span>
    </Link>
  );
}

function TagRow({
  tag,
  count,
  onTag,
}: {
  tag: string;
  count: number;
  onTag: (t: string) => void;
}) {
  return (
    <button type="button" className="lp-sb-tag-row" onClick={() => onTag(tag)}>
      <span className="label" style={{ color: "var(--green)" }}>
        #{tag}
      </span>
      <span className="lp-sb-tag-count tnum">{fmtInt(count)}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Hero — pitch + CTA on the left, the looping "how it works" demo on the right.
   ──────────────────────────────────────────────────────────────────────── */

function MarketingHero({
  onSignIn,
  liveCount,
}: {
  onSignIn: () => void;
  liveCount: number;
}) {
  const word = useTypewriter(TYPEWRITER_WORDS);

  return (
    <div className="lp-mkt-hero">
      <div style={{ minWidth: 0 }}>
        <div className="lp-mkt-eyebrow">
          <span className="live-dot" aria-hidden />
          {liveCount > 0
            ? `${liveCount} session${liveCount === 1 ? "" : "s"} live now`
            : "LiveShortly"}
        </div>
        <h1 className="lp-mkt-title">
          Watch Agent
          <br />
          <span className="lp-tw-word">{word}</span>
          <span className="lp-tw-cursor" aria-hidden /> — live.
        </h1>
        <p className="lp-mkt-sub">
          LiveShortly turns any Claude Code session into a live-streamed,
          replayable, shareable feed. Viewers watch every prompt and tool call as
          it happens — and can talk back to a running session in real time.
        </p>

        <div className="lp-cta">
          <button
            type="button"
            className="lp-btn"
            onClick={onSignIn}
            title="Sign in with Google"
          >
            <span className="lp-btn-g" aria-hidden>
              G
            </span>
            Get Started — Sign Up Free
          </button>
        </div>
      </div>

      <Demo />
    </div>
  );
}

/** A self-contained, looping preview of the product: prompt in, tools + response
 *  out. Illustrative by design (it is the pitch, not the feed) — every other
 *  number and row on this page is live API data. */
function Demo() {
  return (
    <div className="lp-demo">
      <div className="lp-demo-titlebar">
        <div className="lp-demo-dots" aria-hidden>
          <span className="lp-demo-dot r" />
          <span className="lp-demo-dot a" />
          <span className="lp-demo-dot g" />
        </div>
        <span className="lp-demo-title">LiveShortly · How it works</span>
        <span className="lp-demo-badge">
          <span className="live-dot" aria-hidden />
          Demo
        </span>
      </div>
      <div className="lp-demo-urlbar">🔒 liveshortly.com/session/lucid-cobra-6110</div>
      <div className="lp-demo-body">
        <div className="lp-demo-status">
          <span className="live-dot" aria-hidden />
          Live lucid-cobra-6110 · claude-opus-4-8
        </div>

        <div className="lp-demo-scene a">
          <div className="lp-demo-bubble">
            <span className="lp-demo-who">You</span>
            build the JWT auth middleware
          </div>
        </div>
        <div className="lp-demo-scene b">
          <div className="lp-demo-tool">
            <span className="w">Wrote</span>api/authn.go{" "}
            <span style={{ color: "var(--green)" }}>+187</span>
          </div>
          <div className="lp-demo-resp">
            <span className="lp-demo-who">Claude</span>
            done — Authn now verifies Bearer + cookie tokens on every route
          </div>
        </div>
      </div>
      <div className="lp-demo-foot">
        <span className="lp-demo-play" aria-hidden>
          ▶
        </span>
        <span className="lp-demo-caption">Open the URL — watch it live</span>
        <div className="lp-demo-track">
          <div className="lp-demo-fill" />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Proof strip — real aggregate counts + the handles actually streaming.
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
  return (
    <div className="lp-proof">
      <div className="lp-proof-stat">
        <span className="v tnum">{stats ? fmtInt(stats.total_sessions) : "—"}</span>
        <span className="l">Total sessions</span>
      </div>
      <div className="lp-proof-sep" />
      <div className="lp-proof-stat">
        <span className="v tnum" style={{ color: "var(--green)" }}>
          {stats ? fmtInt(stats.live_now) : "—"}
        </span>
        <span className="l">Live now</span>
      </div>
      <div className="lp-proof-sep" />
      <div className="lp-proof-stat">
        <span className="v tnum">{stats ? fmtInt(stats.creators) : "—"}</span>
        <span className="l">Creators</span>
      </div>

      {liveOwners.length > 0 && (
        <div className="lp-proof-watch">
          <div className="lp-proof-avatars">
            {liveOwners.map((h) => (
              <Avatar
                key={h}
                seed={h}
                size={26}
                className="lp-proof-avatar"
                title={`@${h}`}
              />
            ))}
          </div>
          <span className="lp-proof-watch-label">
            {joinHandles(liveOwners)} streaming now
            {liveCount > liveOwners.length ? " · and more" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Feed cards
   ──────────────────────────────────────────────────────────────────────── */

function CardGrid({ sessions }: { sessions: Session[] }) {
  return (
    <div className="lp-grid">
      {sessions.map((s) => (
        <Card key={s.id} session={s} />
      ))}
    </div>
  );
}

function Card({ session }: { session: Session }) {
  const live = session.status === "live";
  return (
    <Link href={`/session/${session.id}`} className="lp-card">
      <div className="lp-card-art">
        <span className={`lp-card-badge${live ? " live" : ""}`}>
          {live && <span className="live-dot" aria-hidden />}
          {live ? "Live" : `${fmtInt(session.view_count)} views`}
        </span>
        <span className="lp-card-watch">
          ▶ {live ? "Watch Live" : "Replay"}
        </span>
      </div>
      <div className="lp-card-body">
        <div className="lp-card-title">{session.title || "untitled session"}</div>
        <div className="lp-card-meta">
          <span className="m">@{session.owner_handle}</span>
          {session.model && (
            <>
              <span aria-hidden>·</span>
              <span>{session.model}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   How it works — the real install → run → share flow with copyable commands.
   ──────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  // Type the full one-liner `live login && live claude` in step 2, animated.
  const RUN_FLOW = `${LOGIN_CMD} && ${RUN_CMD}`;
  const typedCmd = useTypewriter([RUN_FLOW]);
  return (
    <section className="lp-how-wrap">
      <div className="lp-sec-head">
        <h2 className="lp-sec-title">How it works</h2>
        <span className="lp-how-eyebrow">◦ Get started in 3 steps</span>
      </div>
      <div className="lp-how">
        <div className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">01</span>
            <span className="lp-how-h">Install Live</span>
          </div>
          <div className="lp-how-d">
            One command drops the live CLI onto your PATH. Idempotent — rerun any
            time to update.
          </div>
          <div className="lp-how-code">
            <span className="cmd">
              <b>$</b>
              {INSTALL_CMD}
            </span>
            <CopyButton command={INSTALL_CMD} className="lp-how-copy" />
          </div>
          <Link href="/install" className="lp-how-sub">
            All versions →
          </Link>
        </div>

        <div className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">02</span>
            <span className="lp-how-h">Run Live Claude</span>
          </div>
          <div className="lp-how-d">
            Sign in once with <code>live login</code>, then <code>live claude</code>{" "}
            wraps Claude Code and opens a session, printing your share URL the
            moment it starts streaming.
          </div>
          <div className="lp-how-code">
            <span className="cmd">
              <b>$</b>
              <span className="lp-cmd-type">{typedCmd}</span>
              <span className="lp-cmd-caret" aria-hidden>
                ▋
              </span>
            </span>
            <CopyButton command={RUN_FLOW} className="lp-how-copy" />
          </div>
          <div className="lp-how-sub" style={{ color: "var(--green)" }}>
            ▸ Streaming · liveshortly.com/session/…
          </div>
        </div>

        <div className="lp-how-step">
          <div className="lp-how-head">
            <span className="lp-how-n tnum">03</span>
            <span className="lp-how-h">Share or Publish</span>
          </div>
          <div className="lp-how-d">
            Open the URL to watch live from the browser, send a private link to a
            teammate, or publish it to the public feed.
          </div>
          <div className="lp-how-badges">
            {["Private Link", "Public Feed", "Open · No Login"].map((b) => (
              <span key={b} className="lp-how-badge">
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-foot">
      <span>
        Made with <span style={{ color: "var(--green)" }}>♥</span> by{" "}
        <a href="https://x.com/ironfisto/" target="_blank" rel="noopener noreferrer">
          @ironfisto
        </a>{" "}
        ·{" "}
        <a href="https://x.com/sec_r0" target="_blank" rel="noopener noreferrer">
          @sec_r0
        </a>
      </span>
      <span>© {year} LiveShortly · All rights reserved</span>
    </footer>
  );
}

function CopyButton({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={`Copy: ${command}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // clipboard may be blocked; the command is still selectable
        }
      }}
    >
      {copied ? "✓ Copied" : "⧉ Copy"}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

interface Creator {
  handle: string;
  sessions: number;
  views: number;
}

function dedupe(sessions: Session[]): Session[] {
  const seen = new Set<string>();
  return sessions.filter((s) => !seen.has(s.id) && seen.add(s.id));
}

/** Top publishers among the sessions currently loaded — sessions first, views
 *  as the tiebreak. Rolled up client-side from the feed the visitor can see. */
function rollupCreators(sessions: Session[]): Creator[] {
  const by = new Map<string, Creator>();
  for (const s of sessions) {
    const c = by.get(s.owner_handle) ?? {
      handle: s.owner_handle,
      sessions: 0,
      views: 0,
    };
    c.sessions += 1;
    c.views += s.view_count;
    by.set(s.owner_handle, c);
  }
  return [...by.values()]
    .sort((a, b) => b.sessions - a.sessions || b.views - a.views)
    .slice(0, 3);
}

function rollupTags(sessions: Session[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
}

const AVATAR_COLORS = [
  "var(--admin)",
  "var(--green)",
  "var(--amber)",
  "var(--faint)",
];

/** Stable colour per handle — same creator, same swatch, every render. */
function avatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(handle: string): string {
  const parts = handle.replace(/[@_.-]+/g, " ").trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1][0] : (parts[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

function joinHandles(handles: string[]): string {
  const hs = handles.map((h) => `@${h}`);
  if (hs.length === 1) return hs[0];
  return `${hs.slice(0, -1).join(", ")} & ${hs[hs.length - 1]}`;
}

/** Types a word out, holds, deletes it, moves to the next — forever. Viewers who
 *  ask for reduced motion get the first word, printed once. */
function useTypewriter(words: string[]): string {
  const [text, setText] = useState("");

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setText(words[0]);
      return;
    }

    const TYPE_MS = 55;
    const DELETE_MS = 32;
    const HOLD_MS = 1500;
    const GAP_MS = 300;
    let wi = 0;
    let ci = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = words[wi];
      if (!deleting) {
        ci++;
        setText(word.slice(0, ci));
        if (ci === word.length) {
          deleting = true;
          timer = setTimeout(tick, HOLD_MS);
          return;
        }
        timer = setTimeout(tick, TYPE_MS);
      } else {
        ci--;
        setText(word.slice(0, ci));
        if (ci === 0) {
          deleting = false;
          wi = (wi + 1) % words.length;
          timer = setTimeout(tick, GAP_MS);
          return;
        }
        timer = setTimeout(tick, DELETE_MS);
      }
    };
    timer = setTimeout(tick, TYPE_MS);
    return () => clearTimeout(timer);
    // `words` is a module-level constant list at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return text;
}
