"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SessionCard from "@/components/SessionCard";
import ShareDialog from "@/components/ShareDialog";
import PublishAction from "@/components/PublishAction";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import { listSessions, type Session } from "@/lib/api";
import { fmtInt } from "@/lib/utils";

const POLL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState<string>(params.get("q") ?? "");
  const statusParam = params.get("status");
  const status: "all" | "live" | "ended" =
    statusParam === "live" || statusParam === "ended" ? statusParam : "all";
  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [sharedErr, setSharedErr] = useState<string | null>(null);

  // Which owned session has its invite (share) popover open (at most one).
  const [shareFor, setShareFor] = useState<Session | null>(null);

  // Merge an updated session (e.g. after toggling its link) into MY SESSIONS.
  const updateMine = (u: Session) =>
    setMine((cur) =>
      cur ? cur.map((s) => (s.id === u.id ? { ...s, ...u } : s)) : cur,
    );

  // Drop a session from MY SESSIONS after it is permanently deleted.
  const removeMine = (id: string) =>
    setMine((cur) => (cur ? cur.filter((s) => s.id !== id) : cur));

  // Reflect the search query into the URL (shallow), preserving the status filter.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (status !== "all") qs.set("status", status);
    const s = qs.toString();
    router.replace(s ? `/hud?${s}` : "/hud", { scroll: false });
  }, [query, status, router]);

  // MY SESSIONS — scope=mine, debounced search, polled, filtered by status.
  const mineReq = useRef(0);
  useEffect(() => {
    let alive = true;
    let ctrl = new AbortController();
    const run = async () => {
      const my = ++mineReq.current;
      ctrl = new AbortController();
      try {
        const r = await listSessions(
          { scope: "mine", status, q: query, limit: 100 },
          ctrl.signal,
        );
        if (alive && my === mineReq.current) {
          setMine(r.results);
          setMineErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setMineErr("Could not load your sessions.");
      }
    };
    const t = setTimeout(run, query ? SEARCH_DEBOUNCE_MS : 0);
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(t);
      clearInterval(id);
    };
  }, [query, status]);

  // SHARED WITH ME — scope=shared, polled.
  useEffect(() => {
    let alive = true;
    let ctrl = new AbortController();
    const run = async () => {
      ctrl = new AbortController();
      try {
        const r = await listSessions(
          { scope: "shared", status: "all", limit: 100 },
          ctrl.signal,
        );
        if (alive) {
          setShared(r.results);
          setSharedErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setSharedErr("Could not load shared sessions.");
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  // Owner action row shared by every owned card (publish + share popover).
  const ownerActions = (s: Session) => (
    <>
      <PublishAction session={s} onChanged={updateMine} />
      <ShareAction
        session={s}
        open={shareFor?.id === s.id}
        onToggle={() => setShareFor((cur) => (cur?.id === s.id ? null : s))}
        onClose={() => setShareFor(null)}
      />
      <DeleteSessionButton id={s.id} onDeleted={() => removeMine(s.id)} compact />
    </>
  );

  // Split owned sessions so live ones headline their own grid.
  const liveMine = mine?.filter((s) => s.status === "live") ?? [];
  const restMine = mine?.filter((s) => s.status !== "live") ?? [];
  const restLabel = status === "ended" ? "ENDED SESSIONS" : "RECENT SESSIONS";

  return (
    <>
      <SearchBox query={query} onQuery={setQuery} />

      {/* Filter breadcrumb — mirrors the ?status= chip from the header tiles. */}
      {status !== "all" && (
        <div
          className="label"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            color: "var(--muted)",
          }}
        >
          <span>FILTER · {status} only</span>
          <button
            type="button"
            onClick={() =>
              router.replace(
                query ? `/hud?q=${encodeURIComponent(query)}` : "/hud",
                { scroll: false },
              )
            }
            className="label"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--red)",
              padding: 0,
            }}
          >
            ✕ CLEAR
          </button>
        </div>
      )}

      {/* ◉ LIVE NOW — owned live sessions, highlighted */}
      {liveMine.length > 0 && (
        <Section title="◉ LIVE NOW" count={liveMine.length} tone="green">
          <CardGrid>
            {liveMine.map((s) => (
              <SessionCard key={s.id} session={s} actions={ownerActions(s)} />
            ))}
          </CardGrid>
        </Section>
      )}

      {liveMine.length > 0 && <div style={{ height: 24 }} />}

      {/* ▣ MY SESSIONS — the rest (or the filtered set) */}
      <Section
        title={status === "live" ? "◉ MY LIVE SESSIONS" : `▣ ${restLabel}`}
        count={status === "live" ? undefined : restMine.length}
        hint={query ? `filter "${query}"` : undefined}
      >
        {mineErr ? (
          <ErrorBar text={mineErr} />
        ) : mine == null ? (
          <Loading what="MY SESSIONS" />
        ) : mine.length === 0 ? (
          <Empty
            title="NO SESSIONS YET"
            sub={
              query
                ? `Nothing matched "${query}".`
                : "Start a Claude Code session to capture one here."
            }
          />
        ) : status === "live" ? (
          // Live-only filter: everything already shown in LIVE NOW above.
          liveMine.length === 0 && (
            <Empty title="NO LIVE SESSIONS" sub="Nothing is streaming right now." />
          )
        ) : restMine.length === 0 ? (
          <Empty
            title={liveMine.length > 0 ? "NOTHING ELSE YET" : "NO SESSIONS YET"}
            sub={
              liveMine.length > 0
                ? "Your only sessions are live right now."
                : "Start a Claude Code session to capture one here."
            }
          />
        ) : (
          <CardGrid>
            {restMine.map((s) => (
              <SessionCard key={s.id} session={s} actions={ownerActions(s)} />
            ))}
          </CardGrid>
        )}
      </Section>

      <div style={{ height: 28 }} />

      {/* 🔗 SHARED WITH ME */}
      <Section title="🔗 SHARED WITH ME" count={shared?.length}>
        {sharedErr ? (
          <ErrorBar text={sharedErr} />
        ) : shared == null ? (
          <Loading what="SHARED SESSIONS" />
        ) : shared.length === 0 ? (
          <Empty title="NOTHING SHARED" sub="No sessions shared with you yet." />
        ) : (
          <CardGrid>
            {shared.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                accessRole={s.shared_role ?? "viewer"}
              />
            ))}
          </CardGrid>
        )}
      </Section>
    </>
  );
}

/** Responsive card grid used across the dashboard sections. */
function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))",
        gap: 14,
      }}
    >
      {children}
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
        className="label"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          border: "1px solid var(--strong)",
          background: open ? "var(--strong)" : "transparent",
          color: open ? "var(--panel)" : "var(--ink)",
          padding: "5px 10px",
          fontSize: 10,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⊕ SHARE
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

function SearchBox({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "0 10px",
        marginBottom: 20,
      }}
    >
      <span className="label" aria-hidden>
        /
      </span>
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="SEARCH MY SESSIONS — TITLE OR TAG"
        aria-label="Search my sessions"
        spellCheck={false}
        className="label"
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--ink)",
          padding: "11px 0",
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

function Section({
  title,
  count,
  hint,
  onClearFilter,
  tone,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  onClearFilter?: () => void;
  tone?: "green";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className="label dashed-b"
        style={{
          paddingBottom: 8,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: tone === "green" ? "var(--green)" : "var(--ink)" }}>
          {title}
        </span>
        {count != null && (
          <span className="tnum" style={{ color: "var(--muted)" }}>
            · {fmtInt(count)}
          </span>
        )}
        {hint && <span style={{ color: "var(--faint)" }}>· {hint}</span>}
        {onClearFilter && (
          <button
            type="button"
            onClick={onClearFilter}
            className="label"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--red)",
              padding: 0,
            }}
          >
            ✕ CLEAR
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ErrorBar({ text }: { text: string }) {
  return (
    <div
      className="label"
      style={{
        border: "1px solid var(--red)",
        color: "var(--red)",
        padding: "8px 12px",
      }}
    >
      ⚠ {text}
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <div
      className="label"
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "28px 16px",
        color: "var(--muted)",
      }}
    >
      LOADING {what}
      <span className="blink">_</span>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--hairline)",
        background: "var(--panel)",
        padding: "32px 16px",
        textAlign: "center",
      }}
    >
      <div className="label" style={{ fontSize: 13, color: "var(--ink)" }}>
        {title}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
        {sub}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading what="HUD" />}>
      <Dashboard />
    </Suspense>
  );
}
