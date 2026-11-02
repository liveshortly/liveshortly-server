"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FeedCard from "@/components/FeedCard";
import Skeleton from "@/components/ui/Skeleton";
import { getFeed, type FeedPage, type Session } from "@/lib/api";
import { fmtInt, frameworkLabel } from "@/lib/utils";
import st from "./Feed.module.css";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;
const TRENDING_COUNT = 4;

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** `initial` = the first page, fetched on the server for this `?q=`, so the
 *  feed is in the HTML; the client only fetches again when the query changes. */
export default function Feed({ initial }: { initial?: FeedPage | null }) {
  return (
    <Suspense fallback={null}>
      <FeedInner initial={initial ?? null} />
    </Suspense>
  );
}

function FeedInner({ initial }: { initial: FeedPage | null }) {
  // Seeded from ?q=… so the topbar search (which navigates to /feed?q=…)
  // lands directly on results.
  const initialQuery = useSearchParams().get("q")?.trim() ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [items, setItems] = useState<Session[]>(initial?.results ?? []);
  const [cursor, setCursor] = useState<string>(initial?.next_cursor ?? "");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!!initial && !initial.next_cursor);
  const [err, setErr] = useState<string | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(!!initial);
  const skipFirst = useRef(!!initial);
  const [agent, setAgent] = useState<string | null>(null);

  const searching = debounced.length > 0;

  // Debounce the search query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Reset + load the first page whenever the (debounced) query changes.
  const reqId = useRef(0);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false; // the server already loaded this query
      return;
    }
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

  // "By agent" tabs — only the agents present on the loaded feed.
  const agents = useMemo(
    () => [...new Set(items.map((s) => frameworkLabel(s.framework)))].filter((a) => a !== "—"),
    [items],
  );
  const shown = useMemo(
    () => (agent ? items.filter((s) => frameworkLabel(s.framework) === agent) : items),
    [items, agent],
  );

  // Derived sections (browse only — a search never reshuffles its results).
  const live = useMemo(() => shown.filter((s) => s.status === "live"), [shown]);
  // Trending this week: most-viewed of the last 7 days, views > 0.
  const trending = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return shown
      .filter(
        (s) =>
          s.status !== "live" &&
          s.view_count > 0 &&
          new Date(s.published_at ?? s.created_at).getTime() >= since,
      )
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, TRENDING_COUNT);
  }, [shown]);
  // New: everything else, in the server's newest-first order (no dupes).
  const fresh = useMemo(() => {
    const taken = new Set(trending.map((s) => s.id));
    return shown.filter((s) => s.status !== "live" && !taken.has(s.id));
  }, [shown, trending]);

  // Tags from the real tags on the loaded feed.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of items)
      for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  return (
    <div className={st.feed}>
      <header className={st.head}>
        <h1>Feed</h1>
        <p>Public sessions from people building with coding agents.</p>
      </header>

      <SearchBox query={query} onQuery={setQuery} />

      {!searching && agents.length > 1 && (
        <div className={st.tabs} role="tablist" aria-label="Filter by agent">
          {[null, ...agents].map((a) => (
            <button
              key={a ?? "all"}
              type="button"
              role="tab"
              aria-selected={agent === a}
              className={st.tab}
              onClick={() => setAgent(a)}
            >
              {a ?? "All agents"}
            </button>
          ))}
        </div>
      )}

      {err && (
        <p className={st.err} role="alert">
          {err}
        </p>
      )}

      {!firstLoaded ? (
        <SkeletonGrid count={6} />
      ) : searching ? (
        items.length === 0 && !err ? (
          <Empty>No published sessions match “{debounced}”.</Empty>
        ) : (
          <Grid items={items} />
        )
      ) : items.length === 0 && !err ? (
        <Empty>
          Nothing is published yet. Run a session with LiveShortly, then publish it
          here for anyone to watch or replay.
        </Empty>
      ) : (
        <>
          {live.length > 0 && (
            <Section title="Live now" sub={`${live.length} streaming`} live>
              <Grid items={live} />
            </Section>
          )}
          {trending.length > 0 && (
            <Section title="Trending this week" sub="Most watched">
              <Grid items={trending} />
            </Section>
          )}
          {fresh.length > 0 && (
            <Section title="New">
              <Grid items={fresh} />
            </Section>
          )}
          {categories.length > 0 && (
            <Section title="Tags">
              <div className={st.tags}>
                {categories.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuery(tag)}
                    className={st.tag}
                  >
                    #{tag} <span className="tnum">{fmtInt(count)}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinel} style={{ height: 1 }} />
      <p className={st.status} aria-live="polite">
        {loading && firstLoaded ? "Loading…" : done && items.length > 0 ? "You’re all caught up." : ""}
      </p>
    </div>
  );
}

function Section({
  title,
  sub,
  live,
  children,
}: {
  title: string;
  sub?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={st.section}>
      <h2 className={st.sectionHead}>
        {live && <span className="live-dot" aria-hidden />}
        {title}
        {sub && <span className={st.sub}>{sub}</span>}
      </h2>
      {children}
    </section>
  );
}

function Grid({ items }: { items: Session[] }) {
  if (items.length === 0) return null;
  return (
    <div className={st.grid}>
      {items.map((s) => (
        <FeedCard key={s.id} session={s} />
      ))}
    </div>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className={st.grid} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={132} radius={10} style={{ display: "block" }} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={st.empty}>{children}</p>;
}

/** Filters the list (server-side search on title, summary and tags). */
function SearchBox({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (v: string) => void;
}) {
  return (
    <div className={st.search}>
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Filter by title, summary or tag"
        aria-label="Filter the feed"
        spellCheck={false}
      />
      {query && (
        <button type="button" onClick={() => onQuery("")} aria-label="Clear filter">
          Clear
        </button>
      )}
    </div>
  );
}
