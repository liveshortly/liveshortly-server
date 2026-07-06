"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import EventStream from "@/components/EventStream";
import PublicLinkDialog from "@/components/PublicLinkDialog";
import PublishAction from "@/components/PublishAction";
import ShareToTwitter from "@/components/ShareToTwitter";
import TypingIndicator from "@/components/TypingIndicator";
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
  type SessionDetail,
  type SessionEvent,
} from "@/lib/api";
import { fmtInt, localTime, shortId, timeAgo } from "@/lib/utils";

type Connection = "idle" | "connecting" | "open" | "closed" | "ended";

export default function SessionViewer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [meta, setMeta] = useState<SessionDetail | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [conn, setConn] = useState<Connection>("idle");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  // Mobile-only: the ⚙ actions sheet, and its own Share Link trigger (kept
  // separate from the desktop one above since both can be simultaneously
  // mounted — the desktop button just sits hidden via CSS on narrow screens).
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
          <div className="label" style={{ marginTop: 16 }}>
            <a href={loginUrl()} style={{ color: "var(--green)" }}>
              ◂ SIGN IN
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

      {/* Session header / meta strip */}
      <div
        style={{
          border: "1px solid var(--strong)",
          background: "var(--panel)",
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div className="label" style={{ color: "var(--faint)" }}>
              SESSION {shortId(id)}
            </div>
            <TitleBlock
              meta={meta}
              loadingLabel={err ? "—" : "loading…"}
              onRenamed={(title) =>
                setMeta((m) => (m ? { ...m, title } : m))
              }
            />
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
            {meta && <Badge status={meta.status} size="md" />}
            <div
              className="session-actions"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              {/* Share to X — makes it public (owner) + opens a pre-filled tweet. */}
              {meta && (
                <ShareToTwitter
                  session={meta}
                  onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
                />
              )}
              {/* Publish / Unpublish — owner only, beside the status badge. */}
              {meta?.is_owner && (
                <PublishAction
                  session={meta}
                  onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
                />
              )}
              {meta?.is_owner && (
                <span style={{ display: "inline-block" }}>
                  <button
                    ref={linkBtnRef}
                    type="button"
                    onClick={() => setLinkDialogOpen((v) => !v)}
                    className="label"
                    aria-haspopup="dialog"
                    aria-expanded={linkDialogOpen}
                    style={{
                      border: "1px solid var(--strong)",
                      background: linkDialogOpen ? "var(--strong)" : "transparent",
                      color: linkDialogOpen ? "var(--panel)" : "var(--ink)",
                      padding: "5px 10px",
                      fontSize: 10,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ⊕ SHARE LINK
                  </button>
                  {linkDialogOpen && (
                    <PublicLinkDialog
                      sessionId={id}
                      title={meta.title}
                      visibility={meta.visibility ?? "private"}
                      anchorEl={linkBtnRef.current}
                      onClose={() => setLinkDialogOpen(false)}
                      onChanged={(u) => setMeta((m) => (m ? { ...m, ...u } : m))}
                    />
                  )}
                </span>
              )}
              {meta?.is_owner && meta.status === "live" && (
                <EndButton
                  id={id}
                  onEnded={() =>
                    setMeta((m) =>
                      m
                        ? { ...m, status: "ended", ended_at: new Date().toISOString() }
                        : m,
                    )
                  }
                />
              )}
              {meta?.is_owner && (
                <DeleteSessionButton
                  id={id}
                  onDeleted={() => router.push("/hud")}
                />
              )}
            </div>
            {/* Mobile-only: collapses the row above into a single ⚙ button. */}
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

        <div
          className="dashed-b"
          style={{ height: 1, margin: "12px 0" }}
          aria-hidden
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          <MetaCell
            label={meta?.client_handle ? "Captured by" : "Owner"}
            value={
              meta
                ? (meta.client_handle ?? `@${meta.owner_handle}`)
                : "—"
            }
          />
          <MetaCell label="Model" value={meta?.model ?? "—"} />
          <MetaCell label="Framework" value={meta?.framework ?? "—"} />
          <MetaCell label="Events" value={fmtInt(eventTotal)} mono />
          <MetaCell label="Views" value={fmtInt(meta?.view_count ?? 0)} mono />
          <MetaCell
            label={meta?.status === "ended" ? "Ended" : "Started"}
            value={
              meta
                ? meta.status === "ended"
                  ? timeAgo(meta.ended_at)
                  : timeAgo(meta.created_at)
                : "—"
            }
            mono
          />
          {meta && (meta.input_tokens ?? 0) + (meta.output_tokens ?? 0) > 0 && (
            <MetaCell
              label="Tokens (in / out)"
              value={`${fmtInt(meta.input_tokens ?? 0)} / ${fmtInt(
                meta.output_tokens ?? 0,
              )}`}
              mono
            />
          )}
          {meta?.git_remote && (
            <GitCell remote={meta.git_remote} branch={meta.git_branch} />
          )}
        </div>

        {meta?.tags && meta.tags.length > 0 && (
          <div className="label" style={{ marginTop: 10, color: "var(--muted)" }}>
            #{meta.tags.join("  #")}
          </div>
        )}

        {/* Alternate views of this session (new design). Replay/Story read the
            same events; the Composer is owner-only. */}
        {meta && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px dashed var(--hairline)",
            }}
          >
            <ViewLink href={`/replay/${id}`}>▶ REPLAY</ViewLink>
            <ViewLink href={`/story/${id}`}>✎ DEV STORY</ViewLink>
            {meta.is_owner && (
              <ViewLink href={`/compose/${id}`}>✎ COMPOSE</ViewLink>
            )}
          </div>
        )}
      </div>

      {/* ── Twitch-style split: event stream (left) + viewer chat (right) ── */}
      <div className="viewer-body">
        {/* LEFT — the event stream */}
        <div className="stream-pane">
          <div
            className="label"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "0 2px 8px",
            }}
          >
            <span>EVENT LOG</span>
            <span style={{ color: "var(--muted)" }}>
              {streamLabel(conn, isLive)}
            </span>
          </div>

          <EventStream
            events={events}
            live={isLive}
            ownerHandle={meta?.owner_handle ?? null}
            fill
          />

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

          {claudeTyping && (
            <div style={{ padding: "8px 2px 0" }}>
              <TypingIndicator label="CLAUDE IS WORKING" tone="green" />
            </div>
          )}
        </div>

        {/* RIGHT — viewer chat sidebar */}
        <ChatPane
          id={id}
          events={events}
          isLive={isLive}
          canComment={meta?.can_comment !== false}
          emphasizeComposer={inputPending}
          viewerCount={meta?.view_count ?? 0}
          viewerTyping={viewerIsTyping ? viewerTyping : null}
          ownerHandle={meta?.owner_handle ?? null}
        />
      </div>

      {/* Mobile-only: composer pinned below the unified stream, since the
          desktop composer (inside .chat-pane) is hidden at this width. */}
      <div className="mobile-composer-bar">
        {isLive ? (
          meta?.can_comment !== false ? (
            <Composer id={id} emphasize={inputPending} />
          ) : (
            <div
              className="label"
              style={{
                border: "1px dashed var(--hairline)",
                color: "var(--muted)",
                padding: "10px 12px",
                textAlign: "center",
              }}
            >
              ◦ VIEW ONLY
            </div>
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

/** Right-hand viewer chat sidebar: viewer comments as a running chat, a live
 *  typing indicator, and the composer (or a read-only note). */
function ChatPane({
  id,
  events,
  isLive,
  canComment,
  emphasizeComposer,
  viewerCount,
  viewerTyping,
  ownerHandle,
}: {
  id: string;
  events: SessionEvent[];
  isLive: boolean;
  canComment: boolean;
  emphasizeComposer: boolean;
  viewerCount: number;
  viewerTyping: { who: string; until: number } | null;
  ownerHandle: string | null;
}) {
  const chat = useMemo(
    () => events.filter((e) => e.event_type === "viewer_comment"),
    [events],
  );
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.length, viewerTyping]);

  const who = (e: SessionEvent): string => {
    const u = (e.payload as Record<string, unknown>)?.username;
    if (typeof u === "string" && u.trim()) return u.trim();
    return e.actor && e.actor !== "agent" ? e.actor : "viewer";
  };
  const text = (e: SessionEvent): string => {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    for (const k of ["message", "text", "content"]) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };

  return (
    <aside className="chat-pane">
      {/* header */}
      <div
        className="label dashed-b"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          color: "var(--ink)",
        }}
      >
        <span>✉ VIEWER CHAT</span>
        <span className="tnum" style={{ color: "var(--muted)" }}>
          ◔ {fmtInt(viewerCount)}
        </span>
      </div>

      {/* messages */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px" }}>
        {chat.length === 0 ? (
          <div
            className="label"
            style={{ color: "var(--faint)", padding: "12px 2px" }}
          >
            {isLive
              ? "NO MESSAGES YET — SAY SOMETHING"
              : "NO VIEWER CHAT ON THIS SESSION"}
          </div>
        ) : (
          chat.map((e) => (
            <div key={e.id} style={{ marginBottom: 12 }}>
              <div
                className="label tnum"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  color: "var(--amber)",
                  fontSize: 10,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  @{who(e)}
                  {who(e) === ownerHandle ? " · HOST" : ""}
                </span>
                <span style={{ color: "var(--faint)", flexShrink: 0 }}>
                  {localTime(e.ts)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink)",
                  marginTop: 3,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {text(e)}
              </div>
            </div>
          ))
        )}
        {viewerTyping && (
          <TypingIndicator label={`@${viewerTyping.who} IS TYPING`} tone="amber" />
        )}
        <div ref={endRef} />
      </div>

      {/* composer / read-only note */}
      <div style={{ borderTop: "1px solid var(--hairline)", padding: 10 }}>
        {isLive ? (
          canComment ? (
            <Composer id={id} emphasize={emphasizeComposer} />
          ) : (
            <div
              className="label"
              style={{
                border: "1px dashed var(--hairline)",
                color: "var(--muted)",
                padding: "10px 12px",
                textAlign: "center",
              }}
            >
              ◦ VIEW ONLY
            </div>
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
    </aside>
  );
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
  const accent =
    state === "sent"
      ? "var(--green)"
      : state === "error"
        ? "var(--red)"
        : emphasize
          ? "var(--amber)"
          : "var(--strong)";

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          border: `1px solid ${accent}`,
          background: "var(--panel)",
          transition: "border-color 150ms",
        }}
      >
        <span
          className="label"
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            color: "var(--green)",
            borderRight: "1px solid var(--hairline)",
          }}
        >
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
          className="label"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--ink)",
            padding: "11px 12px",
            fontSize: 12,
            letterSpacing: "0.06em",
            opacity: sending ? 0.6 : 1,
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || text.trim().length === 0}
          className="label"
          style={{
            border: "none",
            borderLeft: `1px solid ${accent}`,
            background:
              state === "sent" ? "var(--green)" : "var(--strong)",
            color: "var(--panel)",
            padding: "0 16px",
            fontSize: 11,
            cursor:
              sending || text.trim().length === 0 ? "default" : "pointer",
            opacity: text.trim().length === 0 && state === "idle" ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {state === "sent"
            ? "✓ SENT"
            : sending
              ? "SENDING…"
              : "SEND ▸"}
        </button>
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

function MetaCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label">{label}</div>
      <div
        className={mono ? "tnum" : undefined}
        style={{
          fontSize: 14,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
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

/** A meta cell that links out to the session's git remote. */
function GitCell({
  remote,
  branch,
}: {
  remote: string;
  branch?: string | null;
}) {
  const url = gitWebUrl(remote);
  const label = remote.replace(/^.*[/:]([^/]+\/[^/]+?)(?:\.git)?$/, "$1");
  const text = branch ? `${label} @ ${branch}` : label;
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label">Git</div>
      <div
        style={{
          fontSize: 14,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={remote}
      >
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--green)", textDecoration: "underline" }}
          >
            ↗ {text}
          </a>
        ) : (
          text
        )}
      </div>
    </div>
  );
}
