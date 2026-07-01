"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FeedTile from "@/components/FeedTile";
import { getFeed, type Session } from "@/lib/api";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 24;

export default function Feed() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Session[]>([]);
  const [cursor, setCursor] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(false);

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

  return (
    <div>
      {/* Page heading + back link */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <h1
          className="label"
          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.1em" }}
        >
          ▣ FEED
          <span style={{ color: "var(--muted)", marginLeft: 10, fontWeight: 400 }}>
            published sessions
          </span>
        </h1>
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "0 12px",
          marginBottom: 18,
        }}
      >
        <span className="label" aria-hidden>
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
            onClick={() => setQuery("")}
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

      {err && (
        <div className="label" style={{ color: "var(--red)", marginBottom: 12 }}>
          ⚠ {err}
        </div>
      )}

      {firstLoaded && items.length === 0 && !err ? (
        <div
          className="label"
          style={{
            border: "1px dashed var(--hairline)",
            background: "var(--panel)",
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          {debounced
            ? `NO PUBLISHED SESSIONS MATCH "${debounced}"`
            : "NO PUBLISHED SESSIONS YET — PUBLISH ONE FROM YOUR HUD"}
        </div>
      ) : (
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
      )}

      {/* Sentinel + status */}
      <div ref={sentinel} style={{ height: 1 }} />
      <div
        className="label"
        style={{
          textAlign: "center",
          color: "var(--faint)",
          padding: "18px 0",
        }}
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
