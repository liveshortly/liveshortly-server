"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FeedTile from "@/components/FeedTile";
import { getFeed, type Session } from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;
const TRENDING_COUNT = 4;

export default function Feed({
  showPlaceholderHero = true,
}: {
  /** Skip the value-prop hero when there's nothing to feature yet — set to
   *  false when the caller (e.g. the landing page) already has its own. */
  showPlaceholderHero?: boolean;
} = {}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Session[]>([]);
  const [cursor, setCursor] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(false);

  const searching = debounced.length > 0;

  // Debounce the search query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Reset + load the first page whenever the (debounced) query changes.
  const reqId = useRef(0);
  useEffect(() => {
    const my = ++reqId.current;
    setItems([]);
    setCursor("");
    setDone(false);
    setErr(null);
    setFirstLoaded(false);
    setLoading(true);
    const ctrl = new AbortController();
    (async () => {
      try {
        const page = await getFeed(
          { q: debounced, limit: PAGE_SIZE },
          ctrl.signal,
        );
        if (my !== reqId.current) return;
        setItems(page.results);
        setCursor(page.next_cursor);
        setDone(!page.next_cursor);
      } catch (e) {
        if (my === reqId.current && (e as Error).name !== "AbortError")
          setErr("Could not load the feed.");
      } finally {
        if (my === reqId.current) {
          setLoading(false);
          setFirstLoaded(true);
        }
      }
    })();
    return () => ctrl.abort();
  }, [debounced]);

  const loadMore = useCallback(async () => {
    if (loading || done || !cursor) return;
    const my = reqId.current;
    setLoading(true);
    try {
      const page = await getFeed(
        { q: debounced, cursor, limit: PAGE_SIZE },
        undefined,
      );
      if (my !== reqId.current) return;
      setItems((cur) => {
        const seen = new Set(cur.map((s) => s.id));
        return [...cur, ...page.results.filter((s) => !seen.has(s.id))];
      });
      setCursor(page.next_cursor);
      setDone(!page.next_cursor);
    } catch {
      // leave the load-more sentinel; user can scroll to retry
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [loading, done, cursor, debounced]);

  // Infinite scroll: load more when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [loadMore]);

  // Derived curated sections (home view only — never while searching, so a
  // search never reshuffles the user's result set).
  const live = useMemo(() => items.filter((s) => s.status === "live"), [items]);

  const featured = useMemo<Session | null>(() => {
    if (live.length > 0) return live[0];
    if (items.length > 0)
      return [...items].sort((a, b) => b.view_count - a.view_count)[0];
    return null;
  }, [live, items]);

  // Trending: most-viewed, excluding the hero and anything with no views yet.
  const trending = useMemo(
    () =>
      [...items]
        .filter((s) => s.id !== featured?.id && s.view_count > 0)
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, TRENDING_COUNT),
    [items, featured],
  );
  const trendingIds = useMemo(
    () => new Set(trending.map((s) => s.id)),
    [trending],
  );

  // Main grid — everything except the hero and the Trending picks (no dupes).
  const recent = useMemo(
    () => items.filter((s) => s.id !== featured?.id && !trendingIds.has(s.id)),
    [items, featured, trendingIds],
  );

  // Browse-by-tag chips from the real tags on the loaded feed.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of items)
      for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  return (
    <div>
      {/* ── Hero — featured live/top session, or the value-prop placeholder ── */}
      {!searching &&
        (featured || (firstLoaded && showPlaceholderHero)) && (
          <Hero session={featured} />
        )}

      {/* ── Search ── */}
      <SearchBox query={query} onQuery={setQuery} />

      {err && (
        <div className="label" style={{ color: "var(--red)", margin: "12px 0" }}>
          ⚠ {err}
        </div>
      )}

      {/* ── SEARCHING: flat result grid (no curated sections) ── */}
      {searching ? (
        <div style={{ marginTop: 14 }}>
          {firstLoaded && items.length === 0 && !err ? (
            <Empty>{`NO PUBLISHED SESSIONS MATCH "${debounced}"`}</Empty>
          ) : (
            <Grid items={items} />
          )}
        </div>
      ) : (
        <>
          {/* LIVE NOW */}
          <SectionHead
            title="◉ LIVE NOW"
            sub={live.length > 0 ? `${live.length} streaming` : undefined}
            tone="green"
          />
          {live.length > 0 ? (
            <Grid items={live} />
          ) : (
            <Empty subtle>
              NO LIVE SESSIONS RIGHT NOW — START ONE FROM YOUR TERMINAL
            </Empty>
          )}

          {/* TRENDING */}
          {trending.length > 0 && (
            <>
              <SectionHead title="▲ TRENDING" sub="most watched" />
              <Grid items={trending} />
            </>
          )}

          {/* RECENTLY PUBLISHED */}
          <SectionHead
            title="▣ RECENTLY PUBLISHED"
            sub={firstLoaded ? `${fmtInt(items.length)} loaded` : undefined}
          />
          {firstLoaded && recent.length === 0 && !featured && !err ? (
            <Empty>NO PUBLISHED SESSIONS YET — PUBLISH ONE FROM YOUR HUD</Empty>
          ) : (
            <Grid items={recent} />
          )}

          {/* BROWSE BY TAG — real tags */}
          {categories.length > 0 && (
            <>
              <SectionHead title="⊞ BROWSE BY TAG" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                {categories.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuery(tag)}
                    className="lift label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      border: "1px solid var(--hairline)",
                      background: "var(--panel)",
                      color: "var(--ink)",
                      padding: "13px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      #{tag}
                    </span>
                    <span className="tnum" style={{ color: "var(--faint)" }}>
                      {fmtInt(count)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* CTA — how to capture a session (instructional, not placeholder) */}
          <StartStreamingCta />
        </>
      )}

      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinel} style={{ height: 1 }} />
      <div
        className="label"
        style={{ textAlign: "center", color: "var(--faint)", padding: "18px 0" }}
      >
        {loading
          ? "LOADING…"
          : done && items.length > 0
            ? "● END OF FEED"
            : ""}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────────────────── */

/** The featured hero. With no session to feature, renders the value-prop
 *  placeholder — never fabricated session data. */
function Hero({ session }: { session: Session | null }) {
  if (!session) return <HeroPlaceholder />;
  const live = session.status === "live";
  return (
    <Link
      href={`/session/${session.id}`}
      className="lift"
      style={{
        display: "block",
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "22px 22px 20px",
        marginBottom: 20,
      }}
    >
      <div
        className="label"
        style={{
          color: live ? "var(--green)" : "var(--muted)",
          marginBottom: 10,
        }}
      >
        {live ? "◉ FEATURED · LIVE NOW" : "★ FEATURED SESSION"}
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {session.title || "untitled session"}
          </h1>
          <div
            className="label"
            style={{
              marginTop: 10,
              color: "var(--muted)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--ink)" }}>@{session.owner_handle}</span>
            {session.model && (
              <>
                <span style={{ color: "var(--hairline)" }}>·</span>
                <span>{session.model}</span>
              </>
            )}
            {session.git_branch && (
              <>
                <span style={{ color: "var(--hairline)" }}>·</span>
                <span>⎇ {session.git_branch}</span>
              </>
            )}
          </div>

          {/* Stat row — all real */}
          <div
            style={{
              display: "flex",
              gap: 26,
              marginTop: 16,
              flexWrap: "wrap",
            }}
          >
            <HeroStat label="Events" value={fmtInt(session.event_count)} />
            <HeroStat label="Views" value={fmtInt(session.view_count)} />
            <HeroStat
              label={live ? "Started" : "Published"}
              value={timeAgo(session.published_at ?? session.created_at)}
            />
          </div>

          {session.tags && session.tags.length > 0 && (
            <div className="label" style={{ marginTop: 14, color: "var(--faint)" }}>
              #{session.tags.slice(0, 6).join("  #")}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <span
              className="label"
              style={{
                display: "inline-block",
                border: "1px solid var(--strong)",
                background: "var(--strong)",
                color: "var(--panel)",
                padding: "9px 16px",
                fontWeight: 700,
              }}
            >
              ▶ {live ? "WATCH LIVE" : "REPLAY SESSION"}
            </span>
          </div>
        </div>

        {/* Right pane — real hero snippet preview, or a subtle terminal frame */}
        <div
          style={{
            flex: "1 1 300px",
            minWidth: 0,
            border: "1px solid var(--hairline)",
            background: "var(--bg)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            overflow: "hidden",
          }}
        >
          <div className="label" style={{ color: "var(--faint)" }}>
            {live ? "◉ live preview" : "› session preview"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--muted)",
              display: "-webkit-box",
              WebkitLineClamp: 7,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {session.hero ? (
              <>
                <span style={{ color: "var(--green)" }}>›</span> {session.hero}
              </>
            ) : (
              <span style={{ color: "var(--faint)" }}>
                Open the session to watch the event stream.
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="tnum"
        style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}
      >
        {value}
      </div>
      <div className="label" style={{ marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

/** Value-prop hero shown when there is nothing to feature yet. */
function HeroPlaceholder() {
  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "34px 24px",
        marginBottom: 20,
      }}
    >
      <div className="label" style={{ color: "var(--green)" }}>
        ◉ LIVESHORTLY
      </div>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.2,
          margin: "12px 0 0",
          color: "var(--ink)",
          maxWidth: 620,
        }}
      >
        Stream your Claude Code sessions — live, replayable, shareable.
      </h1>
      <p
        style={{
          margin: "12px 0 0",
          color: "var(--muted)",
          fontSize: 13.5,
          lineHeight: 1.6,
          maxWidth: 620,
        }}
      >
        Nothing is published yet. Run a session with the capture hooks installed,
        then publish it here for anyone to watch or replay.
      </p>
    </div>
  );
}

/** The 3-step "start streaming" explainer — real product instructions. */
function StartStreamingCta() {
  const steps: [string, string, string][] = [
    [
      "01",
      "Install hooks",
      "Add the capture hooks to ~/.claude and sign in via the CLI device flow.",
    ],
    [
      "02",
      "Run Claude Code",
      "Your session opens automatically and streams events in real time.",
    ],
    [
      "03",
      "Share or publish",
      "Send a private link, or publish the session to this public feed.",
    ],
  ];
  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "22px 22px 24px",
        margin: "26px 0 8px",
      }}
    >
      <div className="label" style={{ color: "var(--green)" }}>
        ▶ START STREAMING
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          margin: "8px 0 18px",
          color: "var(--ink)",
        }}
      >
        Turn a terminal session into a stream in three steps
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {steps.map(([num, title, desc]) => (
          <div
            key={num}
            style={{
              border: "1px solid var(--hairline)",
              background: "var(--bg)",
              padding: "14px 15px",
            }}
          >
            <div
              className="tnum label"
              style={{ color: "var(--green)", fontSize: 13, fontWeight: 700 }}
            >
              {num}
            </div>
            <div style={{ fontWeight: 700, marginTop: 6, color: "var(--ink)" }}>
              {title}
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--muted)",
                marginTop: 4,
              }}
            >
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  sub,
  tone,
}: {
  title: string;
  sub?: string;
  tone?: "green";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        margin: "22px 0 12px",
      }}
    >
      <h2
        className="label"
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: tone === "green" ? "var(--green)" : "var(--ink)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {sub && (
        <span className="label" style={{ color: "var(--faint)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function Grid({ items }: { items: Session[] }) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))",
        gap: 14,
      }}
    >
      {items.map((s) => (
        <FeedTile key={s.id} session={s} />
      ))}
    </div>
  );
}

function Empty({
  children,
  subtle,
}: {
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <div
      className="label"
      style={{
        border: "1px dashed var(--hairline)",
        background: subtle ? "transparent" : "var(--panel)",
        padding: subtle ? "22px 16px" : "40px 20px",
        textAlign: "center",
        color: subtle ? "var(--faint)" : "var(--muted)",
      }}
    >
      {children}
    </div>
  );
}

function SearchBox({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "0 12px",
        marginBottom: 6,
      }}
    >
      <span className="label" aria-hidden>
        ⌕
      </span>
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="SEARCH THE FEED — TITLE, SNIPPET OR TAG"
        aria-label="Search the feed"
        spellCheck={false}
        className="label"
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--ink)",
          padding: "12px 0",
          width: "100%",
          fontSize: 12,
          letterSpacing: "0.06em",
        }}
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label="Clear search"
          className="label"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--faint)",
            fontSize: 13,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
