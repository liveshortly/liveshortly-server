"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Badge from "@/components/Badge";
import EventStream from "@/components/EventStream";
import {
  ApiError,
  getSession,
  isPublicLink,
  postComment,
  postDecision,
  renameSession,
  stopSession,
  streamUrl,
  type SessionDetail,
  type SessionEvent,
} from "@/lib/api";
import { fmtInt, shortId, timeAgo, utcTime } from "@/lib/utils";

type Connection = "idle" | "connecting" | "open" | "closed" | "ended";

export default function SessionViewer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [meta, setMeta] = useState<SessionDetail | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [conn, setConn] = useState<Connection>("idle");

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
        if (e instanceof ApiError && e.status === 403) {
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
        if (t === "connected") return;
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
            {meta && isPublicLink(meta) && (
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
                title="Anyone with the link can view this session"
              >
                ● PUBLIC
              </span>
            )}
            {meta && !isPublicLink(meta) && (meta.share_count ?? 0) > 0 && (
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
            {meta && <Badge status={meta.status} size="md" />}
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
      </div>

      {/* Stream status line */}
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
        <span style={{ color: "var(--muted)" }}>{streamLabel(conn, isLive)}</span>
      </div>

      <EventStream
        events={events}
        live={isLive}
        ownerHandle={meta?.owner_handle ?? null}
      />

      {/* Input-requested banner — Claude is waiting; any viewer who can comment
          may answer, and their message drives the session. Permission prompts
          additionally get one-tap Yes/No quick replies. */}
      {inputPending && (
        <InputRequestBanner
          id={id}
          message={(inputRequest?.payload?.message as string) || ""}
          kind={(inputRequest?.payload?.kind as string) || "input"}
          canReply={isLive && meta?.can_comment !== false}
        />
      )}

      {/* Composer — only while live AND the viewer is allowed to comment.
          Read-only viewers (e.g. opened via a public link) get a quiet note. */}
      {isLive &&
        (meta?.can_comment !== false ? (
          <Composer id={id} emphasize={inputPending} />
        ) : (
          <div
            className="label"
            style={{
              marginTop: 10,
              border: "1px dashed var(--hairline)",
              background: "var(--panel)",
              color: "var(--muted)",
              padding: "11px 12px",
              textAlign: "center",
            }}
          >
            ◦ VIEW ONLY · READ-ONLY ACCESS
          </div>
        ))}

      <div
        className="label tnum"
        style={{ marginTop: 8, color: "var(--faint)", textAlign: "right" }}
      >
        {fmtInt(events.length)} EVENTS RENDERED
        {events.length > 0
          ? ` · LAST ${utcTime(events[events.length - 1]?.ts)} UTC`
          : ""}
      </div>
    </div>
  );
}

type SendState = "idle" | "sending" | "sent" | "error";

/** Banner shown while Claude waits for input. Renders the request message and,
 *  for permission prompts, one-tap quick replies that any commenter can use to
 *  answer without typing. Replies post as ordinary messages (queued + injected
 *  into the CLI on the next prompt/tool boundary). */
function InputRequestBanner({
  id,
  message,
  kind,
  canReply,
}: {
  id: string;
  message: string;
  kind: string;
  canReply: boolean;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Permission prompts post a real allow/deny decision that the CLI's
  // PreToolUse hook is waiting on — one tap actually answers the prompt. A plain
  // input wait has nothing to decide, so "continue" is just a steering message.
  const replies =
    kind === "permission"
      ? [
          { label: "✓ YES, ALLOW", value: "allow", decision: "allow" as const },
          { label: "✕ NO, DENY", value: "deny", decision: "deny" as const },
        ]
      : [{ label: "▸ CONTINUE", value: "continue", decision: null }];

  const quickSend = async (r: {
    value: string;
    decision: "allow" | "deny" | null;
  }) => {
    if (busy) return;
    setBusy(true);
    try {
      if (r.decision) await postDecision(id, r.decision);
      else await postComment(id, r.value);
      setSent(r.value);
    } catch {
      // best-effort; the composer below remains available
    } finally {
      setBusy(false);
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
        gap: 8,
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
          {message || "Claude is waiting — send a message to steer the session."}
        </span>
      </div>

      {canReply && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {replies.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => quickSend(r)}
              disabled={busy}
              className="label"
              style={{
                border: "1px solid var(--amber)",
                background: sent === r.value ? "var(--amber)" : "transparent",
                color: sent === r.value ? "var(--panel)" : "var(--ink)",
                padding: "6px 14px",
                cursor: busy ? "default" : "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {sent === r.value ? "✓ SENT" : r.label}
            </button>
          ))}
          <span
            className="label"
            style={{
              alignSelf: "center",
              color: "var(--muted)",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            or type a full reply below
          </span>
        </div>
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
