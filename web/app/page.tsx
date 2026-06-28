"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SessionTable from "@/components/SessionTable";
import ShareDialog from "@/components/ShareDialog";
import PublicLinkDialog from "@/components/PublicLinkDialog";
import { isPublicLink, listSessions, type Session } from "@/lib/api";
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

  // Which owned session has its invite / public-link popover open (at most one).
  const [shareFor, setShareFor] = useState<Session | null>(null);
  const [publicFor, setPublicFor] = useState<Session | null>(null);

  // Merge an updated session (e.g. after toggling its link) into MY SESSIONS.
  const updateMine = (u: Session) =>
    setMine((cur) =>
      cur ? cur.map((s) => (s.id === u.id ? { ...s, ...u } : s)) : cur,
    );

  // Reflect the search query into the URL (shallow), preserving the status filter.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (status !== "all") qs.set("status", status);
    const s = qs.toString();
    router.replace(s ? `/?${s}` : "/", { scroll: false });
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

  return (
    <>
      <SearchBox query={query} onQuery={setQuery} />

      {/* MY SESSIONS */}
      <Section
        title="MY SESSIONS"
        count={mine?.length}
        hint={
          status !== "all"
            ? `${status} only`
            : query
              ? `filter "${query}"`
              : undefined
        }
        onClearFilter={
          status !== "all"
            ? () => router.replace(query ? `/?q=${encodeURIComponent(query)}` : "/", { scroll: false })
            : undefined
        }
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
        ) : (
          <SessionTable
            sessions={mine}
            action={(s) => (
              <span
                style={{
                  display: "inline-flex",
                  gap: 8,
                  justifyContent: "flex-end",
                }}
              >
                <PublicShareAction
                  session={s}
                  open={publicFor?.id === s.id}
                  onToggle={() => {
                    setShareFor(null);
                    setPublicFor((cur) => (cur?.id === s.id ? null : s));
                  }}
                  onClose={() => setPublicFor(null)}
                  onChanged={updateMine}
                />
                <ShareAction
                  session={s}
                  open={shareFor?.id === s.id}
                  onToggle={() => {
                    setPublicFor(null);
                    setShareFor((cur) => (cur?.id === s.id ? null : s));
                  }}
                  onClose={() => setShareFor(null)}
                />
              </span>
            )}
          />
        )}
      </Section>

      <div style={{ height: 28 }} />

      {/* SHARED WITH ME */}
      <Section title="SHARED WITH ME" count={shared?.length}>
        {sharedErr ? (
          <ErrorBar text={sharedErr} />
        ) : shared == null ? (
          <Loading what="SHARED SESSIONS" />
        ) : shared.length === 0 ? (
          <Empty
            title="NOTHING SHARED"
            sub="NO SESSIONS SHARED WITH YOU YET."
          />
        ) : (
          <SessionTable sessions={shared} showAccess />
        )}
      </Section>
    </>
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

function PublicShareAction({
  session,
  open,
  onToggle,
  onClose,
  onChanged,
}: {
  session: Session;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChanged: (s: Session) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = isPublicLink(session);
  // Active (link is live) → green accent; open → filled; otherwise plain.
  const accent = active ? "var(--green)" : "var(--strong)";
  return (
    <span style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className="label"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? "Link is live — view-only" : "Share with anyone via link"}
        style={{
          border: `1px solid ${accent}`,
          background: open ? accent : "transparent",
          color: open ? "var(--panel)" : active ? "var(--green)" : "var(--ink)",
          padding: "5px 10px",
          fontSize: 10,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {active ? "● PUBLIC" : "⊕ SHARE TO ALL"}
      </button>
      {open && (
        <PublicLinkDialog
          sessionId={session.id}
          title={session.title}
          isPublic={active}
          anchorEl={btnRef.current}
          onClose={onClose}
          onChanged={onChanged}
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
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  onClearFilter?: () => void;
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
        <span style={{ color: "var(--ink)" }}>{title}</span>
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
