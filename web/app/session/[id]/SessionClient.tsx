"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import EventStream from "@/components/EventStream";
import PriorContext from "@/components/PriorContext";
import EmptyState from "@/components/ui/EmptyState";
import SessionMark from "@/components/ui/SessionMark";
import {
  ApiError,
  getSession,
  loginUrl,
  postComment,
  streamUrl,
  type SessionDetail,
  type SessionEvent,
} from "@/lib/api";
import {
  activityLabel,
  agentBusy,
  bodyText,
  pendingProbe,
  toolCallBefore,
  typingLine,
} from "@/lib/transcript";
import { agentCaps, agentTitle, truncate } from "@/lib/utils";
import { useMarkSeen } from "@/lib/useMarkSeen";
import Composer, { ReadOnlyFooter } from "./Composer";
import InfoPanel from "./InfoPanel";
import PermissionBar from "./PermissionBar";
import StatusStrip from "./StatusStrip";
import s from "./session.module.css";

/** Session view (LSW-04/05/06) — Mac LSChatView: status strip, transcript,
 *  permission bar, composer. This file owns loading, the SSE stream, typing
 *  presence and optimistic echoes; the pieces render in sibling modules. */
export default function SessionClient({
  params,
  initial,
}: {
  params: Promise<{ id: string }>;
  /** Public (cookieless, server-fetched) view so open sessions are in the HTML;
   *  refetched client-side with the visitor's cookie. */
  initial?: SessionDetail | null;
}) {
  const { id } = use(params);
  const router = useRouter();
  const me = useAuth();
  const myHandle = me?.handle ?? null;

  const [meta, setMeta] = useState<SessionDetail | null>(initial ?? null);
  const [events, setEvents] = useState<SessionEvent[]>(() =>
    [...(initial?.events ?? [])].sort((a, b) => a.seq - b.seq),
  );
  const [gate, setGate] = useState<"auth" | "access" | "deleted" | "error" | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const [typers, setTypers] = useState<Map<string, number>>(new Map());
  const [infoOpen, setInfoOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const echoes = useRef(new Map<string, string>()); // local id → text
  const lastSeq = useRef(Math.max(0, ...(initial?.events ?? []).map((e) => e.seq)));

  const onMeta = useCallback(
    (u: Partial<SessionDetail>) => setMeta((m) => (m ? { ...m, ...u } : m)),
    [],
  );

  const addEvents = useCallback((incoming: SessionEvent[]) => {
    if (!incoming.length) return;
    setEvents((prev) => {
      let next = prev;
      const have = new Set(prev.map((e) => e.id));
      for (const ev of incoming) {
        if (!ev?.id || have.has(ev.id)) continue;
        // The server's copy replaces our optimistic echo.
        if (ev.event_type === "viewer_comment") {
          const text = bodyText(ev);
          for (const [local, t] of echoes.current) {
            if (t === text) {
              echoes.current.delete(local);
              next = next.filter((e) => e.id !== local);
              break;
            }
          }
        }
        if (next === prev) next = [...prev];
        next.push(ev);
        have.add(ev.id);
        lastSeq.current = Math.max(lastSeq.current, ev.seq);
      }
      return next === prev ? prev : next.sort((a, b) => a.seq - b.seq);
    });
  }, []);

  // Load with the visitor's cookie (owner/commenter fields, private sessions).
  const load = useCallback(
    async (signal?: AbortSignal, since?: number) => {
      try {
        const d = await getSession(id, signal, since);
        setMeta(d);
        addEvents(d.events ?? []);
        setGate(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const st = e instanceof ApiError ? e.status : 0;
        if (!since) setGate(st === 401 ? "auth" : st === 403 ? "access" : st === 404 ? "deleted" : "error");
      }
    },
    [id, addEvents],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Live: the SSE stream. EventSource retries on its own; after each reopen we
  // fetch the tail (since_seq) so nothing sent during the gap is lost.
  const live = meta?.status === "live";
  useEffect(() => {
    if (!live) return;
    const es = new EventSource(streamUrl(id, lastSeq.current), { withCredentials: true });
    let dropped = false;
    es.onopen = () => {
      setStreamErr(null);
      if (dropped) load(undefined, lastSeq.current);
      dropped = false;
    };
    es.onerror = () => {
      dropped = true;
      if (es.readyState === EventSource.CLOSED)
        setStreamErr("Stream dropped — reconnect to catch up.");
    };
    es.onmessage = (msg) => {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(msg.data);
      } catch {
        return;
      }
      switch (d?.type) {
        case "connected":
          return;
        case "session_ended":
          es.close();
          return onMeta({ status: "ended", ended_at: new Date().toISOString() });
        case "session_deleted":
          es.close();
          return setGate("deleted");
        case "watchers":
          if (typeof d.count === "number") onMeta({ watcher_count: d.count });
          return;
        case "typing": {
          const who = typeof d.who === "string" ? d.who : "viewer";
          const until = typeof d.until === "number" ? d.until : Date.now() + 2000;
          if (who !== myHandle) setTypers((m) => new Map(m).set(who, until));
          return;
        }
      }
      addEvents([d as unknown as SessionEvent]);
    };
    return () => es.close();
  }, [id, live, streamKey, myHandle, load, addEvents, onMeta]);

  // Expire typers.
  useEffect(() => {
    if (!typers.size) return;
    const t = setInterval(() => {
      setTypers((m) => {
        const now = Date.now();
        const next = new Map([...m].filter(([, until]) => until > now));
        return next.size === m.size ? m : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typers.size]);

  // ⌘I toggles the info panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setInfoOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useMarkSeen(id, events[events.length - 1]?.seq ?? 0);
  const probe = useMemo(() => (live ? pendingProbe(events) : null), [live, events]);
  const toolCall = useMemo(() => (probe ? toolCallBefore(events, probe) : null), [events, probe]);
  const activity = useMemo(() => activityLabel(events), [events]);
  const agent = agentTitle(meta?.framework);

  // Hook/rollout agents (claude, codex, agy) say when a turn ends; pty agents
  // (ollama, gemini, terminal) only stream `output`, so silence ends "working".
  const hooked = agentCaps(meta?.framework).streamEnd;
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (hooked) return;
    const t = setTimeout(() => setQuiet(true), 3000);
    return () => clearTimeout(t);
  }, [events.length, hooked]);
  const busy = !!live && !probe && !quiet && agentBusy(events);

  // Screen-reader announcements: new agent replies, the session ending, a
  // permission request (Mac LSChatView.swift:83-93). Never the backlog.
  const lastReply = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].event_type === "response") return events[i];
    return null;
  }, [events]);
  const seenReply = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seenReply.current !== undefined && lastReply && lastReply.id !== seenReply.current)
      setAnnounce(`${agent}: ${truncate(bodyText(lastReply), 240)}`);
    seenReply.current = lastReply?.id ?? null;
  }, [lastReply, agent]);
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) setAnnounce("Session ended");
    wasLive.current = live;
  }, [live]);

  // A new permission request: announce it, and notify / chime only when the
  // visitor already granted notifications (asked only on a click, never here).
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!probe || notified.current === probe.id) return;
    notified.current = probe.id;
    setAnnounce(`${agent} is asking for permission`);
    try {
      if (Notification.permission === "granted" && document.visibilityState !== "visible") {
        const n = new Notification(`${agent} needs you — LiveShortly`, {
          body: `${meta?.title ?? "Session"}: ${String(probe.payload?.message ?? "waiting for input")}`,
          tag: `ls-input-${id}`,
        });
        n.onclick = () => (window.focus(), n.close());
      }
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g).connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.36);
      o.onended = () => void ctx.close().catch(() => {});
    } catch {
      // best-effort (no Notification API, autoplay policy)
    }
  }, [probe, agent, id, meta?.title]);

  const send = async (text: string) => {
    const local = `local-${crypto.randomUUID()}`;
    echoes.current.set(local, text);
    setEvents((prev) => [
      ...prev,
      {
        id: local,
        session_id: id,
        seq: (prev[prev.length - 1]?.seq ?? 0) + 0.5,
        actor: "viewer",
        event_type: "viewer_comment",
        payload: { message: text, ...(myHandle ? { username: myHandle } : {}) },
        ts: new Date().toISOString(),
      },
    ]);
    try {
      await postComment(id, text);
      return true;
    } catch {
      echoes.current.delete(local);
      setEvents((prev) => prev.filter((e) => e.id !== local));
      return false;
    }
  };

  if (gate && gate !== "error") {
    return (
      <div className={`session-page ${s.page} ${s.gate}`}>
        {gate === "auth" ? (
          <EmptyState icon="lock" title="Sign in to watch">
            This session isn&apos;t open to anonymous viewers.{" "}
            <a className={s.signIn} href={loginUrl()}>
              Sign in
            </a>
          </EmptyState>
        ) : gate === "access" ? (
          <EmptyState icon="lock" title="No access">
            This session isn&apos;t shared with you.
          </EmptyState>
        ) : (
          <EmptyState icon="trash" title="Session not found">
            This session doesn&apos;t exist, or its owner deleted it.
          </EmptyState>
        )}
      </div>
    );
  }

  if (!meta) {
    return (
      <div className={`session-page ${s.page} ${s.gate}`}>
        {gate === "error" ? (
          <EmptyState title="Couldn't load this session" onRetry={() => load()} />
        ) : (
          <p className={`${s.muted} t-callout`} role="status">
            <SessionMark live size={40} />
            Loading session…
          </p>
        )}
      </div>
    );
  }

  const empty = live ? (
    <div className={s.empty}>
      <SessionMark live size={40} />
      <p className="t-title">Session is live</p>
      <p className={`${s.muted} t-callout`}>Waiting for the agent&apos;s first move.</p>
    </div>
  ) : (
    <div className={s.empty}>
      <SessionMark live={false} size={40} />
      <p className="t-title">No activity was recorded</p>
      <p className={`${s.muted} t-callout`}>This session ended without producing any events.</p>
      {meta.is_owner && <DeleteSessionButton id={id} onDeleted={() => router.push("/sessions")} />}
    </div>
  );

  const eventTotal = Math.max(events.length, meta.event_count ?? 0);
  const typing = typingLine([...typers.keys()].map((w) => `@${w}`));

  return (
    <div className={`session-page ${s.page}`}>
      <StatusStrip
        meta={meta}
        eventTotal={eventTotal}
        busy={busy}
        activity={activity}
        onMeta={onMeta}
        onDeleted={() => router.push("/sessions")}
        onToggleInfo={() => setInfoOpen((v) => !v)}
      />
      <div className={s.body}>
        <div className={s.main}>
          {meta.forked_from && (
            <div className={s.prior}>
              <PriorContext id={id} source={meta.forked_from} />
            </div>
          )}
          <EventStream
            events={events}
            live={live}
            ownerHandle={meta.owner_handle}
            framework={meta.framework}
            fill
            busy={busy}
            activity={activity}
            error={streamErr ?? (gate === "error" ? "Couldn't refresh this session." : null)}
            onReconnect={() => {
              setStreamErr(null);
              setStreamKey((k) => k + 1);
              load(undefined, lastSeq.current);
            }}
            empty={empty}
          />
          {probe && (
            <PermissionBar
              key={probe.id}
              sessionId={id}
              probe={probe}
              toolCall={toolCall}
              framework={meta.framework}
              canDecide={meta.is_owner === true}
              ownerHandle={meta.owner_handle}
            />
          )}
          {live && meta.can_comment !== false ? (
            <Composer sessionId={id} typing={typing} focusSignal={probe?.payload?.kind === "permission" ? null : probe?.id} onSend={send} />
          ) : (
            <ReadOnlyFooter ended={!live} signedOut={!me} />
          )}
        </div>
        {infoOpen && (
          <InfoPanel meta={meta} events={events} onMeta={onMeta} onClose={() => setInfoOpen(false)} />
        )}
      </div>
      <div className={s.srOnly} aria-live="polite" role="status">
        {announce}
      </div>
    </div>
  );
}
