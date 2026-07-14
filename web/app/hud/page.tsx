"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import SessionCard from "@/components/SessionCard";
import ShareDialog from "@/components/ShareDialog";
import PublishAction from "@/components/PublishAction";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import { listSessions, type Session } from "@/lib/api";
import { fmtInt } from "@/lib/utils";

const POLL_MS = 5000;

function Dashboard() {
  const [mine, setMine] = useState<Session[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);

  // Which owned session has its invite (share) popover open (at most one).
  const [shareFor, setShareFor] = useState<Session | null>(null);

  const updateMine = (u: Session) =>
    setMine((cur) =>
      cur ? cur.map((s) => (s.id === u.id ? { ...s, ...u } : s)) : cur,
    );
  const removeMine = (id: string) =>
    setMine((cur) => (cur ? cur.filter((s) => s.id !== id) : cur));

  // Poll my sessions. The main window only surfaces LIVE ones now — the full
  // archive lives in the sidebar — so we just track the current live set.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await listSessions({ scope: "mine", status: "all", limit: 100 });
        if (alive) {
          setMine(r.results);
          setMineErr(null);
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError")
          setMineErr("Could not load your sessions.");
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
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

  const liveMine = (mine ?? []).filter((s) => s.status === "live");

  // The HUD main window now surfaces ONLY live sessions as tiles; everything
  // else (archived + shared) is in the persistent sidebar.
  return (
    <>
      {liveMine.length > 0 ? (
        <Section title="◉ LIVE NOW" count={liveMine.length} tone="green">
          <CardGrid>
            {liveMine.map((s) => (
              <SessionCard key={s.id} session={s} actions={ownerActions(s)} />
            ))}
          </CardGrid>
        </Section>
      ) : mineErr ? (
        <ErrorBar text={mineErr} />
      ) : mine == null ? (
        <Loading what="LIVE SESSIONS" />
      ) : (
        <Empty
          title="NO LIVE SESSIONS RIGHT NOW"
          sub="Run `live claude` to start streaming — it shows up here the moment it goes live. Every session, live or archived, is in the sidebar ←"
        />
      )}
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
    <div className="ws-content">
      <Suspense fallback={<Loading what="HUD" />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}
