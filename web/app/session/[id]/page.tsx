"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Badge from "@/components/Badge";
import EventStream from "@/components/EventStream";
import {
  getSession,
  postComment,
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
        if (alive && (e as Error).name !== "AbortError")
          setErr("Could not load this session.");
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
    const es = new EventSource(streamUrl(id));

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
          <div style={{ minWidth: 0 }}>
            <div className="label" style={{ color: "var(--faint)" }}>
              SESSION {shortId(id)}
            </div>
            <h1
              style={{
                fontSize: 19,
                fontWeight: 700,
                margin: "4px 0 0",
                letterSpacing: "-0.01em",
                wordBreak: "break-word",
              }}
            >
              {meta?.title ?? (err ? "—" : "loading…")}
            </h1>
          </div>
          {meta && <Badge status={meta.status} size="md" />}
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
          <MetaCell label="Owner" value={meta ? `@${meta.owner_handle}` : "—"} />
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

      <EventStream events={events} live={isLive} />

      {/* Composer — only while the session is live. */}
      {isLive && <Composer id={id} />}

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

/** Pinned composer to message the live session. Echoes back over SSE. */
function Composer({ id }: { id: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (sentTimer.current) clearTimeout(sentTimer.current);
    };
  }, []);

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
    } catch {
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
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (state === "error" || state === "sent") setState("idle");
          }}
          onKeyDown={onKeyDown}
          disabled={sending}
          placeholder="MESSAGE THE SESSION  /  ⌐ SENT TO CLI"
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
          ⚠ COULD NOT SEND — TRY AGAIN
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
