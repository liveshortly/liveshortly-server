"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TabNav, { type TabKey } from "@/components/TabNav";
import LiveCard from "@/components/LiveCard";
import SessionTable from "@/components/SessionTable";
import { listSessions, type Session } from "@/lib/api";
import { fmtInt } from "@/lib/utils";

const LIVE_POLL_MS = 4000;
const LIST_DEBOUNCE_MS = 300;

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();

  const initialTab: TabKey = params.get("tab") === "sessions" ? "sessions" : "live";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [query, setQuery] = useState<string>(params.get("q") ?? "");

  const [live, setLive] = useState<Session[] | null>(null);
  const [all, setAll] = useState<Session[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  // Reflect tab + query into the URL (shallow, no scroll).
  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("tab", tab);
    if (query) qs.set("q", query);
    router.replace(`/?${qs.toString()}`, { scroll: false });
  }, [tab, query, router]);

  // LIVE tab: poll status=live every ~4s.
  useEffect(() => {
    if (tab !== "live") return;
    let alive = true;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const r = await listSessions({ status: "live", limit: 60 }, ctrl.signal);
        if (alive) {
          setLive(r.results);
          setErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setErr("Could not reach the API.");
      }
    };
    tick();
    const id = setInterval(tick, LIVE_POLL_MS);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(id);
    };
  }, [tab]);

  // SESSIONS tab: fetch status=all with debounced search.
  const reqRef = useRef(0);
  useEffect(() => {
    if (tab !== "sessions") return;
    let alive = true;
    const ctrl = new AbortController();
    const my = ++reqRef.current;
    const run = async () => {
      try {
        const r = await listSessions(
          { status: "all", q: query, limit: 100 },
          ctrl.signal,
        );
        if (alive && my === reqRef.current) {
          setAll(r.results);
          setTotal(r.total);
          setErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setErr("Could not reach the API.");
      }
    };
    const t = setTimeout(run, query ? LIST_DEBOUNCE_MS : 0);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [tab, query]);

  const liveCount = live?.length;
  const onTab = useCallback((t: TabKey) => setTab(t), []);

  return (
    <>
      <TabNav
        tab={tab}
        onTab={onTab}
        query={query}
        onQuery={setQuery}
        liveCount={liveCount}
      />

      {err && (
        <div
          className="label"
          style={{
            border: "1px solid var(--red)",
            color: "var(--red)",
            padding: "8px 12px",
            marginBottom: 14,
          }}
        >
          ⚠ {err}
        </div>
      )}

      {tab === "live" ? (
        <LiveView sessions={live} />
      ) : (
        <SessionsView sessions={all} total={total} query={query} />
      )}
    </>
  );
}

function LiveView({ sessions }: { sessions: Session[] | null }) {
  if (sessions == null) return <Loading what="LIVE FEED" />;
  if (sessions.length === 0)
    return (
      <Empty
        title="NO LIVE SESSIONS"
        sub="Nothing is streaming right now. Start a Claude Code session to light this up."
      />
    );
  return (
    <>
      <SectionLabel>
        LIVE FEED · {fmtInt(sessions.length)} streaming
      </SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
          gap: 12,
        }}
      >
        {sessions.map((s) => (
          <LiveCard key={s.id} session={s} />
        ))}
      </div>
    </>
  );
}

function SessionsView({
  sessions,
  total,
  query,
}: {
  sessions: Session[] | null;
  total: number;
  query: string;
}) {
  if (sessions == null) return <Loading what="SESSION INDEX" />;
  if (sessions.length === 0)
    return (
      <Empty
        title="NO MATCHES"
        sub={
          query
            ? `Nothing matched "${query}".`
            : "No sessions have been recorded yet."
        }
      />
    );
  return (
    <>
      <SectionLabel>
        SESSION INDEX · {fmtInt(sessions.length)} shown / {fmtInt(total)} total
        {query ? ` · filter "${query}"` : ""}
      </SectionLabel>
      <SessionTable sessions={sessions} />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="label dashed-b"
      style={{ paddingBottom: 8, marginBottom: 12 }}
    >
      {children}
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
        padding: "36px 16px",
        textAlign: "center",
      }}
    >
      <div className="label" style={{ fontSize: 13, color: "var(--ink)" }}>
        {title}
      </div>
      <div
        style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}
      >
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
