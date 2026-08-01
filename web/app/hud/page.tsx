"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ShareDialog from "@/components/ShareDialog";
import PublishAction from "@/components/PublishAction";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import SessionStatusDot from "@/components/SessionStatusDot";
import SessionsRightRail from "@/components/SessionsRightRail";
import { listSessions, type Session } from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const POLL_MS = 5000;

/** Pixel match of designs/version3/hud.html — resume hero, Live/Archive/
 *  Shared-with-me row lists, and a right rail of real weekly stats,
 *  personal activity, model usage and top tags. */
export default function Page() {
  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);

  const [shareFor, setShareFor] = useState<Session | null>(null);

  const updateMine = (u: Session) =>
    setMine((cur) => (cur ? cur.map((s) => (s.id === u.id ? { ...s, ...u } : s)) : cur));
  const removeMine = (id: string) =>
    setMine((cur) => (cur ? cur.filter((s) => s.id !== id) : cur));

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const [m, s] = await Promise.all([
          listSessions({ scope: "mine", status: "all", limit: 200 }),
          listSessions({ scope: "shared", status: "all", limit: 100 }),
        ]);
        if (alive) {
          setMine(m.results);
          setShared(s.results);
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

  const live = useMemo(() => (mine ?? []).filter((s) => s.status === "live"), [mine]);
  const archive = useMemo(
    () =>
      (mine ?? [])
        .filter((s) => s.status !== "live")
        .sort(
          (a, b) =>
            +new Date(b.ended_at ?? b.created_at) - +new Date(a.ended_at ?? a.created_at),
        ),
    [mine],
  );

  const ownerActions = (s: Session) => (
    <RowActionsGear>
      <PublishAction session={s} onChanged={updateMine} />
      <ShareAction
        session={s}
        open={shareFor?.id === s.id}
        onToggle={() => setShareFor((cur) => (cur?.id === s.id ? null : s))}
        onClose={() => setShareFor(null)}
      />
      <DeleteSessionButton id={s.id} onDeleted={() => removeMine(s.id)} compact />
    </RowActionsGear>
  );

  const resumeSession = live[0] ?? null;
  const loaded = mine !== null;

  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        <div className="v3-eyebrow">⌂ My HUD</div>

        {resumeSession ? (
          <Link href={`/session/${resumeSession.id}`} className="hud-hero" style={{ textDecoration: "none" }}>
            <div className="hud-hero-text">
              <div className="hk">Continue where you left off</div>
              <div className="ht">{resumeSession.title || "untitled session"}</div>
              <div className="hs">
                Started {timeAgo(resumeSession.created_at)} · {fmtInt(resumeSession.event_count)} events
              </div>
              {resumeSession.hero && (
                <div className="hud-hero-snippet">
                  <span className="glyph">▸</span>
                  {resumeSession.hero}
                </div>
              )}
            </div>
            <span className="hud-hero-cta">▶ Resume watching</span>
          </Link>
        ) : (
          loaded && (
            <div className="hud-idle">
              No live session right now. Run <code>live claude</code> to start
              streaming — it shows up here the moment it goes live.
            </div>
          )
        )}

        {mineErr && <ErrorBar text={mineErr} />}

        {live.length > 0 && (
          <>
            <div className="v3-sec-head">
              <span className="v3-sec-title live">◉ Live ({live.length})</span>
            </div>
            <div className="hud-rows">
              {live.map((s) => (
                <Row key={s.id} session={s} actions={ownerActions(s)} />
              ))}
            </div>
          </>
        )}

        <div className="v3-sec-head">
          <span className="v3-sec-title">Archive</span>
        </div>
        {!loaded ? (
          <div className="v3-empty">LOADING…</div>
        ) : archive.length > 0 ? (
          <div className="hud-rows">
            {archive.map((s) => (
              <Row key={s.id} session={s} actions={ownerActions(s)} />
            ))}
          </div>
        ) : (
          <div className="v3-empty">
            NO ARCHIVED SESSIONS YET — RUN <code>live claude</code> TO START ONE
          </div>
        )}

        {(shared === null || shared.length > 0) && (
          <>
            <div className="v3-sec-head">
              <span className="v3-sec-title">🔗 Shared with me</span>
            </div>
            {shared === null ? (
              <div className="v3-empty">LOADING…</div>
            ) : (
              <div className="hud-rows">
                {shared.map((s) => (
                  <Row key={s.id} session={s} shared />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <SessionsRightRail mine={mine} />
    </div>
  );
}

function Row({
  session,
  actions,
  shared,
}: {
  session: Session;
  actions?: React.ReactNode;
  shared?: boolean;
}) {
  const live = session.status === "live";
  return (
    <div className="hud-row">
      <Link href={`/session/${session.id}`} className="hud-row-link">
        <SessionStatusDot s={session} shared={shared} live={live} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hud-row-title">{session.title || "untitled session"}</div>
          <div className="hud-row-sub">
            {shared
              ? `@${session.owner_handle} · ${session.shared_role ?? "viewer"} access`
              : `${session.model ?? "—"} · ${
                  live ? "started" : "ended"
                } ${timeAgo(live ? session.created_at : (session.ended_at ?? session.created_at))} ago`}
          </div>
        </div>
        <span className={`hud-row-badge${live ? " live" : ""}`}>
          {live && <span className="live-dot" />}
          {live ? "Live" : "Ended"}
        </span>
        <div className="hud-row-events tnum">{fmtInt(session.event_count)} ev</div>
      </Link>
      {actions}
    </div>
  );
}

/**
 * Row actions. Desktop shows them inline; mobile collapses them behind a ⚙ gear
 * that opens a dropdown, so the session name has room on a phone.
 */
function RowActionsGear({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="hud-row-actions" ref={ref}>
      <button
        type="button"
        className="hud-row-gear"
        onClick={() => setOpen((v) => !v)}
        aria-label="Session actions"
        aria-expanded={open}
      >
        ⚙
      </button>
      <div className={`hud-row-icons${open ? " open" : ""}`}>{children}</div>
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
        className="hud-rbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          background: open ? "var(--strong)" : "transparent",
          color: open ? "var(--panel)" : "var(--ink)",
        }}
      >
        ⊕ Share
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

function ErrorBar({ text }: { text: string }) {
  return (
    <div
      className="label"
      style={{
        border: "1px solid var(--red)",
        color: "var(--red)",
        padding: "8px 12px",
        marginBottom: 20,
      }}
    >
      ⚠ {text}
    </div>
  );
}
