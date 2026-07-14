"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Badge from "@/components/Badge";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import EventStream from "@/components/EventStream";
import MobileEventFeed from "@/components/MobileEventFeed";
import PriorContext from "@/components/PriorContext";
import PublicLinkDialog from "@/components/PublicLinkDialog";
import PublishAction from "@/components/PublishAction";
import HandoffButton from "@/components/HandoffButton";
import ShareToTwitter from "@/components/ShareToTwitter";
import ThemeToggle from "@/components/ThemeToggle";
import TypingIndicator from "@/components/TypingIndicator";
import { useWorkspaceDrawer } from "@/components/WorkspaceDrawerContext";
import {
  ApiError,
  getSession,
  isPublished,
  loginUrl,
  postComment,
  postDecision,
  postTyping,
  renameSession,
  stopSession,
  streamUrl,
  type Session,
  type SessionDetail,
  type SessionEvent,
} from "@/lib/api";
import { fmtInt, frameworkLabel, shortId, timeAgo } from "@/lib/utils";

type Connection = "idle" | "connecting" | "open" | "closed" | "ended";

export default function SessionViewer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  // Present only for signed-in viewers inside the workspace shell; the mobile
  // topbar's hamburger toggles the session-history drawer through it. Null for
  // anonymous viewers (no drawer) — the topbar shows a back link instead.
  const drawer = useWorkspaceDrawer();

  const [meta, setMeta] = useState<SessionDetail | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [conn, setConn] = useState<Connection>("idle");
  // Mobile-only: the ⚙ actions sheet, and its own Share Link trigger (kept
  // separate from SessionActionsMenu's own — the desktop trigger sits
  // hidden via CSS on narrow screens, so both can be simultaneously mounted).
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileLinkOpen, setMobileLinkOpen] = useState(false);
  const mobileLinkBtnRef = useRef<HTMLButtonElement>(null);
  // Ephemeral "viewer is typing" presence (from SSE typing frames).
  const [viewerTyping, setViewerTyping] = useState<{
    who: string;
    until: number;
  } | null>(null);

  const seen = useRef<Set<string>>(new Set());

  const addEvents = (incoming: SessionEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((prev) => {
      const next = [...prev];
      let changed = false;
      for (const ev of incoming) {
        if (!ev || !ev.id || seen.current.has(ev.id)) continue;
        seen.current.add(ev.id);
        next.push(ev);
        changed = true;
      }
      if (!changed) return prev;
      next.sort((a, b) => a.seq - b.seq);
      return next;
    });
  };

  // 1) Load metadata + buffered events.
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const detail = await getSession(id, ctrl.signal);
        if (!alive) return;
        setMeta(detail);
        addEvents(detail.events ?? []);
        setErr(null);
      } catch (e) {
        if (!alive || (e as Error).name === "AbortError") return;
        if (e instanceof ApiError && e.status === 401) {
          setNeedsAuth(true);
        } else if (e instanceof ApiError && e.status === 403) {
          setNoAccess(true);
        } else {
          setErr("Could not load this session.");
        }
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 2) If live, open the SSE stream.
  const isLive = meta?.status === "live";
  useEffect(() => {
    if (!meta || !isLive) return;
    setConn("connecting");
    const es = new EventSource(streamUrl(id), { withCredentials: true });

    es.onopen = () => setConn("open");

    es.onmessage = (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data && typeof data === "object" && "type" in data) {
        const t = (data as { type: string }).type;
        if (t === "session_ended") {
          setConn("ended");
          setMeta((m) =>
            m ? { ...m, status: "ended", ended_at: new Date().toISOString() } : m,
          );
          es.close();
          return;
        }
        if (t === "session_deleted") {
          // The owner deleted the session out from under a live viewer.
          setDeleted(true);
          es.close();
          return;
        }
        if (t === "connected") return;
        if (t === "watchers") {
          const n = (data as { count?: number }).count;
          if (typeof n === "number")
            setMeta((m) => (m ? { ...m, watcher_count: n } : m));
          return;
        }
        if (t === "typing") {
          const d = data as { who?: string; until?: number };
          setViewerTyping({
            who: d.who || "viewer",
            until: d.until ?? Date.now() + 4000,
          });
          return;
        }
      }
      // Otherwise it's an Event payload.
      addEvents([data as SessionEvent]);
    };

    es.onerror = () => {
      // EventSource auto-reconnects; reflect a transient state.
      setConn((c) => (c === "ended" ? c : "connecting"));
    };

    return () => {
      es.close();
      setConn("closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isLive, meta?.id]);

  const eventTotal = useMemo(
    () => Math.max(events.length, meta?.event_count ?? 0),
    [events.length, meta?.event_count],
  );

  // The active "Claude is waiting for input" request, if any: the most recent
  // input_requested event NOT yet superseded by further activity.
  const inputRequest = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const t = events[i].event_type;
      if (t === "input_requested") return events[i];
      // Any real activity after the request means Claude moved on.
      if (
        [
          "prompt",
          "response",
          "stream_end",
          "pre_tool",
          "tool_call",
          "post_tool",
          "file_write",
          "output",
          "viewer_comment",
          "viewer_decision",
        ].includes(t)
      ) {
        return null;
      }
    }
    return null;
  }, [events]);
  const inputPending = isLive && !!inputRequest;

  // Expire the viewer-typing indicator when its window lapses.
  useEffect(() => {
    if (!viewerTyping) return;
    const ms = viewerTyping.until - Date.now();
    if (ms <= 0) {
      setViewerTyping(null);
      return;
    }
    const t = setTimeout(() => setViewerTyping(null), ms);
    return () => clearTimeout(t);
  }, [viewerTyping]);
  const viewerIsTyping = !!viewerTyping && viewerTyping.until > Date.now();

  // "Claude is working" is inferred from live stream state: the last event is
  // active work and the turn hasn't ended / isn't waiting on input.
  const claudeTyping = useMemo(() => {
    if (!isLive || inputPending || events.length === 0) return false;
    const t = events[events.length - 1].event_type;
    return ["prompt", "pre_tool", "tool_call", "file_write", "output"].includes(
      t,
    );
  }, [isLive, inputPending, events]);

  // Debounce the raw "working" signal: the last-event-type flips on nearly every
  // SSE frame, so rendering `claudeTyping` directly makes the indicator strobe
  // (mount/unmount rapidly). Turn it on instantly, but linger ~1.4s before
  // turning off, so a steady stream of activity reads as one calm indicator.
  const [showClaudeWorking, setShowClaudeWorking] = useState(false);
  useEffect(() => {
    if (claudeTyping) {
      setShowClaudeWorking(true);
      return;
    }
    const t = setTimeout(() => setShowClaudeWorking(false), 1400);
    return () => clearTimeout(t);
  }, [claudeTyping]);

  // Notify the viewer (browser notification + soft chime) when input is newly
  // requested — so anyone watching knows it's their turn to answer.
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);
  useEffect(() => {
    if (!inputPending || !inputRequest) return;
    if (notifiedFor.current === inputRequest.id) return;
    notifiedFor.current = inputRequest.id;

    const msg =
      (inputRequest.payload?.message as string) ||
      "Claude is waiting for input";
    try {
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.visibilityState !== "visible"
      ) {
        const n = new Notification("⌐ Input requested — LiveShortly", {
          body: `${meta?.title ?? "Session"}: ${msg}`,
          tag: `ls-input-${id}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    } catch {
      // notifications are best-effort
    }
    // Soft chime via WebAudio (no asset needed).
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.36);
      o.onended = () => ctx.close().catch(() => {});
    } catch {
      // audio is best-effort (autoplay policies, etc.)
    }
  }, [inputPending, inputRequest, id, meta?.title]);

  if (deleted) {
    return (
      <div>
        <div
          style={{
            border: "1px solid var(--red)",
            background: "var(--panel)",
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <div className="label" style={{ fontSize: 13, color: "var(--red)" }}>
            ⌫ SESSION DELETED
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>
            THE OWNER PERMANENTLY DELETED THIS SESSION. IT NO LONGER EXISTS.
          </div>
          <div className="label" style={{ marginTop: 16 }}>
            <Link href="/" style={{ color: "var(--green)" }}>
              ◂ BACK TO FEED
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div>
        <div
          style={{
            border: "1px solid var(--amber)",
            background: "var(--panel)",
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <div className="label" style={{ fontSize: 13, color: "var(--amber)" }}>
            ⚿ SIGN IN TO WATCH
          </div>
          <div
            style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}
          >
            THIS SESSION ISN&apos;T OPEN TO ANONYMOUS VIEWERS.
          </div>
          <div style={{ marginTop: 16 }}>
            <a href={loginUrl()} className="lp-signin-btn">
              SIGN IN
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (noAccess) {
    return (
      <div>
        <Link
          href="/"
          className="label"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--muted)",
            marginBottom: 14,
          }}
        >
          ◂ BACK TO HUD
        </Link>
        <div
          style={{
            border: "1px solid var(--red)",
            background: "var(--panel)",
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <div className="label" style={{ fontSize: 13, color: "var(--red)" }}>
            ⊘ NO ACCESS
          </div>
          <div
            style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}
          >
            THIS SESSION ISN&apos;T SHARED WITH YOU.
          </div>
          <div className="label" style={{ marginTop: 16 }}>
            <Link href="/" style={{ color: "var(--green)" }}>
              ◂ RETURN TO YOUR SESSIONS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="session-page">
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

      {/* Session hero (design/version3/session-viewer.html .shero). On mobile the
          media query flattens it into the mock's sticky topbar, so its border,
          background and padding live in CSS — inline styles would beat the query. */}
      <div className="sv-hero">
        {/* Mobile-only hamburger → opens the session-history drawer (or, for
            anonymous viewers with no drawer, links back home). Sits at the
            head of the topbar per design/session-viewer-mobile.html. */}
        {drawer ? (
          <button
            type="button"
            className="session-hamburger"
            onClick={() => drawer.toggle()}
            aria-label="Session history"
            aria-expanded={drawer.open}
          >
            <span />
            <span />
            <span />
          </button>
        ) : (
          <Link
            href="/"
            className="session-hamburger session-hamburger-back"
            aria-label="Back"
          >
            ‹
          </Link>
        )}

        <div className="sv-hero-art" aria-hidden />

        <div className="sv-hero-main">
          <div className="sv-hero-eyebrow">
            {meta && (
              <span
                className={`sv-hero-badge${meta.status === "live" ? "" : " ended"}`}
                title={
                  meta.ended_reason === "quota"
                    ? "Auto-ended — owner reached their storage quota"
                    : undefined
                }
              >
                {meta.status === "live" && <span className="live-dot" />}
                {meta.status === "live"
                  ? "Live"
                  : meta.ended_reason === "quota"
                    ? "Ended · quota"
                    : "Ended"}
              </span>
            )}
            <span>Session · {frameworkLabel(meta?.framework)}</span>
            <span style={{ color: "var(--faint)" }}>{shortId(id)}</span>
          </div>

          <TitleBlock
            meta={meta}
            loadingLabel={err ? "—" : "loading…"}
            onRenamed={(title) => setMeta((m) => (m ? { ...m, title } : m))}
          />

          {meta && (
            <div className="sv-hero-meta tnum">
              <span>@{meta.owner_handle}</span>
              {meta.model && <span>· {meta.model}</span>}
              <span>· {fmtInt(eventTotal)} events</span>
              <span>
                ·{" "}
                {meta.status === "ended"
                  ? `ended ${timeAgo(meta.ended_at)}`
                  : `started ${timeAgo(meta.created_at)}`}
              </span>
              {isLive && (
                <span style={{ color: "var(--green)" }}>
                  · ◔ {fmtInt(meta.watcher_count ?? 0)} watching
                </span>
              )}
            </div>
          )}

          {/* Mobile-only compact meta line — mirrors the mock's slim header. */}
          {meta && (
            <div className="session-mobile-meta label">
              <span
                className={
                  meta.status === "live" ? "session-mm-live" : undefined
                }
              >
                {meta.status === "live" ? "● LIVE" : "● ENDED"}
              </span>
              {meta.model && <span>· {meta.model}</span>}
              <span>
                {meta.status === "live"
                  ? `· ◔ ${fmtInt(meta.watcher_count ?? 0)} watching`
                  : `· ◔ ${fmtInt(meta.view_count ?? 0)} views`}
              </span>
            </div>
          )}
        </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <div className="session-badges">
            {meta && isPublished(meta) && (
              <span
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "var(--green)",
                  border: "1px solid var(--green)",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
                title="Published to the public feed"
              >
                ▣ PUBLISHED
              </span>
            )}
            {meta && (meta.share_count ?? 0) > 0 && (
              <span
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "var(--amber)",
                  border: "1px solid var(--hairline)",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
                title={`Shared with ${meta.share_count} ${
                  meta.share_count === 1 ? "person" : "people"
                }`}
              >
                ⊞ SHARED · {meta.share_count}
              </span>
            )}
            {meta && meta.visibility === "open" && (
              <span
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "var(--green)",
                  border: "1px solid var(--green)",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
                title="Anyone with the link can watch — no sign-in required"
              >
                ◉ OPEN · NO SIGN-IN
              </span>
            )}
            {/* Lineage: this session is itself a fork of another. */}
            {meta?.forked_from && (
              <a
                href={`/session/${meta.forked_from.id}`}
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "var(--muted)",
                  border: "1px solid var(--hairline)",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
                title={`Forked from “${meta.forked_from.title}” by ${meta.forked_from.owner_handle}`}
              >
                ⑃ FORKED FROM {meta.forked_from.owner_handle}
              </a>
            )}
            {/* How many times this session has been handed off / forked. */}
            {meta && (meta.fork_count ?? 0) > 0 && (
              <span
                className="label"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "var(--muted)",
                  border: "1px solid var(--hairline)",
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
                title={`${meta.forker_count ?? meta.fork_count} ${
                  (meta.forker_count ?? meta.fork_count) === 1 ? "user has" : "users have"
                } continued this session`}
              >
                ⑃ FORKED · {meta.fork_count}
              </span>
            )}
            {meta && <Badge status={meta.status} size="md" />}
            </div>
            {/* Desktop (>860px): actions live behind a gear dropdown, matching
                design/version3/session-viewer.html's `.shero-gear`. */}
            {meta && (
              <SessionActionsMenu
                id={id}
                meta={meta}
                onMetaChange={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
                onEnded={() =>
                  setMeta((m) =>
                    m
                      ? { ...m, status: "ended", ended_at: new Date().toISOString() }
                      : m,
                  )
                }
                onDeleted={() => router.push("/hud")}
              />
            )}
            {/* Mobile-only: the same actions in a bottom sheet. */}
            {meta && (
              <button
                type="button"
                className="session-gear-btn label"
                onClick={() => setMoreOpen(true)}
                aria-label="Session actions"
                title="Session actions"
              >
                ⚙
              </button>
            )}
          </div>
      </div>

      {/* ── Split: the event thread (left) + the session info panel (right) ── */}
      <div className="viewer-body">
        {/* LEFT — the event stream */}
        <div className="stream-pane">
          {/* Layout lives in the .stream-log-head CSS rule (not inline) so the
              mobile media query can hide this whole strip — an inline
              display:flex would beat the query. */}
          {/* Prior context (approach B): for a fork, render the source session's
              history up to the snapshot as a distinct, collapsible block above the
              fork's own feed — never merged into the seq-sorted EVENT LOG. */}
          {meta?.forked_from && (
            <PriorContext id={id} source={meta.forked_from} />
          )}

          <div className="label stream-log-head">
            <span>EVENT LOG</span>
            <span style={{ color: "var(--muted)" }}>
              {streamLabel(conn, isLive)}
            </span>
          </div>

          <div className="desktop-feed-wrap">
            <EventStream
              events={events}
              live={isLive}
              ownerHandle={meta?.owner_handle ?? null}
              framework={meta?.framework}
              fill
            />
          </div>
          <div className="mobile-feed-wrap">
            <MobileEventFeed
              events={events}
              live={isLive}
              ownerHandle={meta?.owner_handle ?? null}
              framework={meta?.framework}
            />
          </div>

          {/* Input-requested banner — CLI is waiting for input (non-blocking). */}
          {inputPending && (
            <InputRequestBanner
              id={id}
              message={(inputRequest?.payload?.message as string) || ""}
              kind={(inputRequest?.payload?.kind as string) || "input"}
              canReply={isLive && meta?.can_comment !== false}
              canDecide={isLive && meta?.is_owner === true}
            />
          )}

          {/* "Claude is working" chip, pinned above the composer on both desktop
              and mobile. Kept OUT of the scrollable feed so it stays visible —
              rendering it as the last thread item buried it below the fold on
              mobile (it only showed after scrolling to the very bottom). */}
          {showClaudeWorking && (
            <div style={{ padding: "8px 2px 0" }}>
              <TypingIndicator label="CLAUDE IS WORKING" tone="green" />
            </div>
          )}

          {/* A viewer typing into the session, surfaced just above the composer.
              Viewer comments themselves render inline in the thread (EventStream
              and MobileEventFeed both bubble `viewer_comment`), which is why the
              v3 viewer has no separate chat column. */}
          {viewerIsTyping && viewerTyping && (
            <div style={{ padding: "6px 2px 0" }}>
              <TypingIndicator
                label={`@${viewerTyping.who} IS TYPING`}
                tone="amber"
              />
            </div>
          )}

          {/* Composer, pinned to the bottom of THIS box (a fixed-height flex
              column) rather than the page — a page-level sticky element would
              float over whatever stream content hadn't scrolled past yet. */}
          <div className="sv-composer">
            {isLive ? (
              meta?.can_comment !== false ? (
                <Composer id={id} emphasize={inputPending} />
              ) : (
                <div className="sv-readonly">◦ VIEW ONLY</div>
              )
            ) : (
              <div
                className="label"
                style={{ color: "var(--faint)", textAlign: "center", padding: "8px 4px" }}
              >
                ● SESSION ENDED · CHAT CLOSED
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — session info + who's watching */}
        <SessionInfoPanel
          id={id}
          meta={meta}
          events={events}
          eventTotal={eventTotal}
          isLive={isLive}
          onMetaChange={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
        />
      </div>

      {/* Mobile-only actions sheet, opened by the ⚙ button in the header —
          reuses the same owner-action components as the desktop row above. */}
      {moreOpen && meta && (
        <div
          className="msheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreOpen(false);
          }}
        >
          <div className="msheet" role="dialog" aria-label="Session actions">
            <div className="msheet-handle" />
            {/* Continue this session (handoff) — available to anyone who can read it. */}
            <div className="msheet-row-wrap">
              <HandoffButton sessionId={meta.id} placement="up" fullWidth />
            </div>
            <div className="msheet-row-wrap">
              <ShareToTwitter
                session={meta}
                onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
              />
            </div>
            {meta.is_owner && (
              <div className="msheet-row-wrap">
                <PublishAction
                  session={meta}
                  onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
                />
              </div>
            )}
            {meta.is_owner && (
              <div className="msheet-row-wrap">
                <button
                  ref={mobileLinkBtnRef}
                  type="button"
                  onClick={() => setMobileLinkOpen((v) => !v)}
                  className="label"
                  aria-haspopup="dialog"
                  aria-expanded={mobileLinkOpen}
                  style={{
                    border: "1px solid var(--strong)",
                    background: mobileLinkOpen ? "var(--strong)" : "transparent",
                    color: mobileLinkOpen ? "var(--panel)" : "var(--ink)",
                    padding: "5px 10px",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  ⊕ SHARE LINK
                </button>
              </div>
            )}
            {meta.is_owner && meta.status === "live" && (
              <div className="msheet-row-wrap">
                <EndButton
                  id={id}
                  onEnded={() => {
                    setMeta((m) =>
                      m
                        ? { ...m, status: "ended", ended_at: new Date().toISOString() }
                        : m,
                    );
                    setMoreOpen(false);
                  }}
                />
              </div>
            )}
            {meta.is_owner && (
              <div className="msheet-row-wrap">
                <DeleteSessionButton
                  id={id}
                  onDeleted={() => router.push("/hud")}
                />
              </div>
            )}
            {/* The global header is hidden on the mobile session viewer, so the
                sheet carries the only theme control reachable from here — as in
                design/version3/session-viewer-mobile.html. */}
            <div className="msheet-row-wrap">
              <ThemeToggle />
            </div>
            <div className="msheet-row-wrap">
              <button
                type="button"
                className="label"
                onClick={() => setMoreOpen(false)}
                style={{
                  width: "100%",
                  border: "1px solid var(--hairline)",
                  background: "transparent",
                  color: "var(--muted)",
                  padding: "9px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
      {mobileLinkOpen && meta && (
        <PublicLinkDialog
          sessionId={id}
          title={meta.title}
          visibility={meta.visibility ?? "private"}
          anchorEl={mobileLinkBtnRef.current}
          onClose={() => setMobileLinkOpen(false)}
          onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
        />
      )}
    </div>
  );
}

/** Desktop (>860px) session actions — a `⚙` trigger opening a dropdown of the
 *  same real action components the mobile bottom sheet uses (just reparented,
 *  not restyled — each keeps its own compact button chrome, shared with the
 *  HUD row actions). Closes on an outside click or Escape. */
function SessionActionsMenu({
  id,
  meta,
  onMetaChange,
  onEnded,
  onDeleted,
}: {
  id: string;
  meta: SessionDetail;
  onMetaChange: (u: Session) => void;
  onEnded: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sv-hero-gear-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sv-hero-gear"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Session actions"
        title="Session actions"
      >
        ⚙
      </button>
      {open && (
        <div className="sv-gear-menu" role="menu">
          <div className="sv-gm-item-wrap">
            <HandoffButton sessionId={meta.id} fullWidth />
          </div>
          <div className="sv-gm-item-wrap">
            <ShareToTwitter session={meta} onChanged={onMetaChange} />
          </div>
          {meta.is_owner && (
            <div className="sv-gm-item-wrap">
              <PublishAction session={meta} onChanged={onMetaChange} />
            </div>
          )}
          {meta.is_owner && (
            <div className="sv-gm-item-wrap" style={{ position: "relative" }}>
              <button
                ref={linkBtnRef}
                type="button"
                onClick={() => setLinkOpen((v) => !v)}
                className="label"
                aria-haspopup="dialog"
                aria-expanded={linkOpen}
                style={{
                  width: "100%",
                  border: "1px solid var(--strong)",
                  background: linkOpen ? "var(--strong)" : "transparent",
                  color: linkOpen ? "var(--panel)" : "var(--ink)",
                  padding: "5px 10px",
                  fontSize: 10,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ⊕ SHARE LINK
              </button>
              {linkOpen && (
                <PublicLinkDialog
                  sessionId={id}
                  title={meta.title}
                  visibility={meta.visibility ?? "private"}
                  anchorEl={linkBtnRef.current}
                  onClose={() => setLinkOpen(false)}
                  onChanged={onMetaChange}
                />
              )}
            </div>
          )}
          {(meta.is_owner || meta.status === "live") && <div className="sv-gm-sep" />}
          {meta.is_owner && meta.status === "live" && (
            <div className="sv-gm-item-wrap">
              <EndButton id={id} onEnded={onEnded} />
            </div>
          )}
          {meta.is_owner && (
            <div className="sv-gm-item-wrap">
              <DeleteSessionButton id={id} onDeleted={onDeleted} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Right-hand panel: what this session IS (model, framework, reach, git, tags)
 *  and who is around. The v3 mock has no separate chat column — viewer comments
 *  bubble inline in the thread — so this replaces it.
 *
 *  "Watching now" names only the people who have actually spoken in the session
 *  (their handle is already public in the thread). The rest of the audience is
 *  an anonymous count: presence tokens carry no identity, so there is nobody
 *  else to name without tracking who silently watched whom. */
function SessionInfoPanel({
  id,
  meta,
  events,
  eventTotal,
  isLive,
  onMetaChange,
}: {
  id: string;
  meta: SessionDetail | null;
  events: SessionEvent[];
  eventTotal: number;
  isLive: boolean;
  onMetaChange: (u: Session) => void;
}) {
  // Distinct speakers, most recent first — real handles from real comments.
  const speakers = useMemo(() => {
    const last = new Map<string, string>();
    for (const e of events) {
      if (e.event_type !== "viewer_comment") continue;
      const u = (e.payload as Record<string, unknown>)?.username;
      const who =
        typeof u === "string" && u.trim()
          ? u.trim()
          : e.actor && e.actor !== "agent"
            ? e.actor
            : "viewer";
      last.set(who, e.ts);
    }
    return [...last.entries()]
      .sort((a, b) => +new Date(b[1]) - +new Date(a[1]))
      .slice(0, 4);
  }, [events]);

  const watchers = meta?.watcher_count ?? 0;
  const others = Math.max(0, watchers - speakers.length);

  const [linkOpen, setLinkOpen] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);

  if (!meta) return <aside className="sv-panel" aria-busy />;

  const tokens = (meta.input_tokens ?? 0) + (meta.output_tokens ?? 0);
  const reach = visibilityLabel(meta.visibility);

  return (
    <aside className="sv-panel" aria-label="Session info">
      <div className="sv-panel-hero">
        <div className="sv-panel-cover" aria-hidden />
        <div className="sv-panel-title-row">
          <div className="sv-panel-title">{meta.title || "untitled session"}</div>
          {meta.is_owner && (
            <span style={{ position: "relative" }}>
              <button
                ref={linkBtnRef}
                type="button"
                className="sv-panel-share"
                onClick={() => setLinkOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={linkOpen}
                aria-label="Share this session"
                title="Share this session"
              >
                +
              </button>
              {linkOpen && (
                <PublicLinkDialog
                  sessionId={id}
                  title={meta.title}
                  visibility={meta.visibility ?? "private"}
                  anchorEl={linkBtnRef.current}
                  onClose={() => setLinkOpen(false)}
                  onChanged={onMetaChange}
                />
              )}
            </span>
          )}
        </div>
        <div className="sv-panel-sub">@{meta.owner_handle}</div>

        <div className="sv-panel-h">Session info</div>
        <dl style={{ margin: 0 }}>
          <InfoRow label="Model" value={meta.model ?? "—"} />
          <InfoRow label="Framework" value={frameworkLabel(meta.framework)} />
          {meta.client_handle && (
            <InfoRow label="Captured by" value={meta.client_handle} />
          )}
          <InfoRow label="Events" value={fmtInt(eventTotal)} />
          <InfoRow label="Views" value={fmtInt(meta.view_count ?? 0)} />
          {tokens > 0 && (
            <InfoRow
              label="Tokens in/out"
              value={`${fmtInt(meta.input_tokens ?? 0)} / ${fmtInt(meta.output_tokens ?? 0)}`}
            />
          )}
          <InfoRow label="Reach" value={reach} />
          {meta.git_remote && (
            <InfoRow
              label="Git"
              value={gitLabel(meta.git_remote, meta.git_branch)}
              href={gitWebUrl(meta.git_remote) ?? undefined}
            />
          )}
        </dl>

        {meta.tags && meta.tags.length > 0 && (
          <div
            className="label"
            style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.7 }}
          >
            #{meta.tags.join("  #")}
          </div>
        )}

        {isLive && (
          <div className="sv-panel-foot">
            <span className="sv-watch-count">
              <b className="tnum">{fmtInt(watchers)}</b>{" "}
              {watchers === 1 ? "person" : "people"} watching now
            </span>
          </div>
        )}

        {/* Alternate views of the same events. Compose is owner-only. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px dashed var(--hairline)",
          }}
        >
          <ViewLink href={`/replay/${id}`}>▶ REPLAY</ViewLink>
          <ViewLink href={`/story/${id}`}>✎ DEV STORY</ViewLink>
          {meta.is_owner && <ViewLink href={`/compose/${id}`}>✎ COMPOSE</ViewLink>}
        </div>
      </div>

      <div className="sv-watch-head">
        {isLive ? "◔ Watching now" : "✉ Participants"}
      </div>
      <div className="sv-watch">
        {speakers.length === 0 && others === 0 && (
          <div className="sv-watch-empty">
            {isLive
              ? "No viewers yet — share the link to bring someone in"
              : "Nobody commented on this session"}
          </div>
        )}

        {speakers.map(([who, ts]) => (
          <div key={who} className="sv-watch-row">
            <Avatar seed={who} size={24} className="sv-watch-avatar" title={who} />
            <span style={{ minWidth: 0 }}>
              <span className="sv-watch-name">
                @{who}
                {who === meta.owner_handle ? " · host" : ""}
              </span>
              <span className="sv-watch-sub" style={{ display: "block" }}>
                commented {timeAgo(ts)}
              </span>
            </span>
          </div>
        ))}

        {isLive && others > 0 && (
          <div className="sv-watch-row">
            <span
              className="sv-watch-avatar tnum"
              style={{ background: "var(--faint)" }}
              aria-hidden
            >
              +{others}
            </span>
            <span className="sv-watch-sub">
              and {fmtInt(others)} {others === 1 ? "other" : "others"} watching
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="sv-info-row">
      <dt>{label}</dt>
      <dd className="tnum" title={value}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--green)", textDecoration: "underline" }}
          >
            ↗ {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** Plain-English reach for the sharing state shown in the info panel. */
function visibilityLabel(v: SessionDetail["visibility"]): string {
  switch (v) {
    case "open":
      return "Open · no sign-in";
    case "public":
      return "Public feed";
    case "link":
      return "Anyone with the link";
    default:
      return "Private";
  }
}

function gitLabel(remote: string, branch?: string | null): string {
  const label = remote.replace(/^.*[/:]([^/]+\/[^/]+?)(?:\.git)?$/, "$1");
  return branch ? `${label} @ ${branch}` : label;
}

const HANDLE_COLORS = ["var(--admin)", "var(--green)", "var(--amber)", "var(--faint)"];

/** Stable swatch per handle, so the same person keeps the same colour. */
function handleColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  return HANDLE_COLORS[Math.abs(h) % HANDLE_COLORS.length];
}

function handleInitials(handle: string): string {
  const parts = handle.replace(/[@_.-]+/g, " ").trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1][0] : (parts[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

type SendState = "idle" | "sending" | "sent" | "error";

/** Banner shown while the CLI is waiting for input. Purely informational — it
 *  surfaces the request so a watching viewer can type a reply in the composer
 *  below. It does NOT block the CLI: Claude is answered in the terminal (or by a
 *  viewer message injected on the next turn), never by the web stalling it. */
function InputRequestBanner({
  id,
  message,
  kind,
  canReply,
  canDecide,
}: {
  id: string;
  message: string;
  kind: string;
  canReply: boolean;
  canDecide: boolean;
}) {
  const [verdict, setVerdict] = useState<"allow" | "deny" | "always" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const showDecide = kind === "permission" && canDecide && verdict === null;

  const decide = async (decision: "allow" | "deny" | "always") => {
    if (busy) return;
    setBusy(true);
    try {
      await postDecision(id, decision);
      setVerdict(decision);
    } catch {
      setBusy(false); // let the owner retry
    }
  };

  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        border: "1px solid var(--amber)",
        background: "color-mix(in srgb, var(--amber) 12%, var(--panel))",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        className="label"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--amber)",
        }}
      >
        <span className="live-dot" style={{ background: "var(--amber)" }} />
        <span style={{ fontWeight: 700 }}>
          {kind === "permission" ? "⌐ PERMISSION REQUESTED" : "⌐ INPUT REQUESTED"}
        </span>
        <span
          style={{
            color: "var(--ink)",
            textTransform: "none",
            letterSpacing: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
          title={message}
        >
          {message || "Claude is waiting for input in the CLI."}
        </span>
      </div>
      {showDecide && (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("allow")}
            className="label"
            style={{
              border: "1px solid var(--green)",
              background: "var(--green)",
              color: "var(--panel)",
              padding: "5px 14px",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            ✓ ALLOW
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("always")}
            title="Allow this, and don't ask again for the same command/tool this session"
            className="label"
            style={{
              border: "1px solid var(--green)",
              background: "transparent",
              color: "var(--green)",
              padding: "5px 14px",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            ✓✓ ALLOW ALWAYS
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("deny")}
            className="label"
            style={{
              border: "1px solid var(--red)",
              background: "transparent",
              color: "var(--red)",
              padding: "5px 14px",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            ✕ DENY
          </button>
        </div>
      )}
      {verdict !== null && (
        <span
          className="label"
          style={{
            color: verdict === "deny" ? "var(--red)" : "var(--green)",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          You answered:{" "}
          {verdict === "deny"
            ? "denied"
            : verdict === "always"
              ? "allowed — won't ask again"
              : "allowed"}
          .
        </span>
      )}
      {canReply && kind !== "permission" && (
        <span
          className="label"
          style={{
            color: "var(--muted)",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          Type a reply below — it reaches the session on its next turn.
        </span>
      )}
    </div>
  );
}

/** Pinned composer to message the live session. Echoes back over SSE.
 *  When `emphasize` is set (Claude is waiting for input) it highlights amber
 *  and focuses the input so any viewer can answer immediately. */
function Composer({ id, emphasize = false }: { id: string; emphasize?: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [errMsg, setErrMsg] = useState("COULD NOT SEND — TRY AGAIN");
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Throttle "is typing" presence pings so we send at most one every ~2.5s.
  const lastTypingPing = useRef(0);

  const pingTyping = () => {
    const now = Date.now();
    if (now - lastTypingPing.current < 2500) return;
    lastTypingPing.current = now;
    postTyping(id);
  };

  useEffect(() => {
    return () => {
      if (sentTimer.current) clearTimeout(sentTimer.current);
    };
  }, []);

  // Focus the box when input is freshly requested.
  useEffect(() => {
    if (emphasize) inputRef.current?.focus();
  }, [emphasize]);

  const submit = async () => {
    const message = text.trim();
    if (!message || state === "sending") return;
    setState("sending");
    try {
      await postComment(id, message);
      setText("");
      setState("sent");
      // Don't optimistically add — the SSE echo (deduped by id) will append it.
      if (sentTimer.current) clearTimeout(sentTimer.current);
      sentTimer.current = setTimeout(() => setState("idle"), 1600);
    } catch (e) {
      setErrMsg(
        e instanceof ApiError && e.status === 403
          ? "READ-ONLY — YOU CAN'T COMMENT ON THIS SESSION"
          : "COULD NOT SEND — TRY AGAIN",
      );
      setState("error");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const sending = state === "sending";
  // The wrap's border colour is driven by CSS off this attribute, so hover /
  // focus-within can still win — an inline border would beat both.
  const accent =
    state === "sent"
      ? "green"
      : state === "error"
        ? "red"
        : emphasize
          ? "amber"
          : undefined;

  return (
    <div>
      <div className="sv-composer-wrap" data-accent={accent}>
        <div className="sv-composer-box">
          <span className="sv-composer-glyph" aria-hidden>
            ⌐
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) pingTyping();
              if (state === "error" || state === "sent") setState("idle");
            }}
            onKeyDown={onKeyDown}
            disabled={sending}
            placeholder={
              emphasize
                ? "CLAUDE IS WAITING — TYPE YOUR INPUT  /  ⌐ SENT TO CLI"
                : "MESSAGE THE SESSION  /  ⌐ SENT TO CLI"
            }
            aria-label="Message the session"
            spellCheck={false}
            style={{ opacity: sending ? 0.6 : 1 }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={sending || text.trim().length === 0}
            className="sv-composer-send"
            data-state={state}
          >
            {state === "sent" ? "✓ Sent" : sending ? "Sending…" : "Send ▸"}
          </button>
        </div>
      </div>
      {state === "error" && (
        <div
          className="label"
          style={{ color: "var(--red)", marginTop: 6, paddingLeft: 2 }}
        >
          ⚠ {errMsg}
        </div>
      )}
    </div>
  );
}

function streamLabel(conn: Connection, isLive: boolean): string {
  if (!isLive) return "● ARCHIVED · REPLAY";
  switch (conn) {
    case "open":
      return "● STREAM OPEN";
    case "connecting":
      return "◌ CONNECTING…";
    case "ended":
      return "● SESSION ENDED";
    case "closed":
      return "○ DISCONNECTED";
    default:
      return "◌ IDLE";
  }
}

/** A compact link to an alternate view of this session (replay / story / compose). */
function ViewLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="label"
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "var(--ink)",
        padding: "5px 10px",
        fontSize: 10,
      }}
    >
      {children}
    </Link>
  );
}

/** Session title with an owner-only inline rename affordance. */
function TitleBlock({
  meta,
  loadingLabel,
  onRenamed,
}: {
  meta: SessionDetail | null;
  loadingLabel: string;
  onRenamed: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = () => {
    if (!meta) return;
    setDraft(meta.title);
    setErr(false);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const save = async () => {
    if (!meta) return;
    const title = draft.trim();
    if (!title || title === meta.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErr(false);
    try {
      await renameSession(meta.id, title);
      onRenamed(title);
      setEditing(false);
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  };

  if (editing && meta) {
    return (
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            disabled={saving}
            maxLength={200}
            aria-label="Session name"
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 18,
              fontWeight: 700,
              border: "1px solid var(--strong)",
              background: "var(--bg)",
              color: "var(--ink)",
              padding: "4px 8px",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="label"
            style={{
              border: "1px solid var(--strong)",
              background: "var(--strong)",
              color: "var(--panel)",
              padding: "0 12px",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "…" : "SAVE"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="label"
            style={{
              border: "1px solid var(--hairline)",
              background: "transparent",
              color: "var(--muted)",
              padding: "0 10px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        {err && (
          <div className="label" style={{ color: "var(--red)", marginTop: 4 }}>
            ⚠ COULD NOT RENAME — TRY AGAIN
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        marginTop: 4,
      }}
    >
      <h1
        style={{
          fontSize: 19,
          fontWeight: 700,
          margin: 0,
          letterSpacing: "-0.01em",
          wordBreak: "break-word",
        }}
      >
        {meta?.title ?? loadingLabel}
      </h1>
      {meta?.is_owner && (
        <button
          type="button"
          onClick={begin}
          aria-label="Rename session"
          title="Rename session"
          className="label"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--faint)",
            fontSize: 13,
            padding: 0,
          }}
        >
          ✎
        </button>
      )}
    </div>
  );
}

/** Owner-only END control with a two-click confirm (no blocking dialog). */
function EndButton({ id, onEnded }: { id: string; onEnded: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const end = async () => {
    setBusy(true);
    setErr(false);
    try {
      await stopSession(id);
      onEnded();
    } catch {
      setErr(true);
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => (armed ? end() : setArmed(true))}
      onBlur={() => setArmed(false)}
      disabled={busy}
      className="label"
      title="End this session (the CLI keeps running)"
      style={{
        border: `1px solid var(--red)`,
        background: armed ? "var(--red)" : "transparent",
        color: armed ? "var(--panel)" : "var(--red)",
        padding: "3px 9px",
        cursor: busy ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {busy
        ? "ENDING…"
        : err
          ? "⚠ RETRY END"
          : armed
            ? "CONFIRM END?"
            : "⊘ END SESSION"}
    </button>
  );
}

/** Convert a git remote (ssh or https) to a browsable web URL, or null. */
function gitWebUrl(remote: string): string | null {
  let r = remote.trim().replace(/\.git$/, "");
  // git@host:org/repo  →  https://host/org/repo
  const ssh = r.match(/^git@([^:]+):(.+)$/);
  if (ssh) r = `https://${ssh[1]}/${ssh[2]}`;
  else if (r.startsWith("ssh://")) r = "https://" + r.slice("ssh://".length).replace(/^git@/, "");
  if (!/^https?:\/\//.test(r)) return null;
  return r;
}
