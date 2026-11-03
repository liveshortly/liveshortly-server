"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionEvent } from "@/lib/api";
import {
  bodyText,
  diffLines,
  foldEvents,
  handleOf,
  stepLine,
  type Item,
} from "@/lib/transcript";
import { agentTitle } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { ScrollPre } from "@/components/ui/CodeBlock";
import Icon from "@/components/ui/Icon";
import SessionMark from "@/components/ui/SessionMark";
import s from "./EventStream.module.css";

const COLLAPSED_TAIL = 6;
const DIFF_CAP = 80;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * The session transcript (Mac LSChatView.transcript): day separators, prompt
 * and comment bubbles, agent prose, folded work runs, reasoning, permission
 * captions, a working row, an error row and a jump-to-latest pill. One
 * component at every width. Agent content is rendered as text / markdown —
 * never raw HTML.
 */
export default function EventStream({
  events,
  live,
  ownerHandle,
  framework,
  fill,
  busy,
  activity,
  error,
  onReconnect,
  empty,
}: {
  events: SessionEvent[];
  live?: boolean;
  ownerHandle?: string | null;
  framework?: string | null;
  /** Grow to fill the parent instead of a fixed height. */
  fill?: boolean;
  /** The agent is working now: shows the standing working row. */
  busy?: boolean;
  activity?: string;
  /** Stream error text: shows the warn row with Reconnect. */
  error?: string | null;
  onReconnect?: () => void;
  /** Replaces the default empty state. */
  empty?: React.ReactNode;
}) {
  const items = useMemo(() => foldEvents(events), [events]);
  const agent = agentTitle(framework);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);

  const toBottom = (smooth = false) => {
    const el = scrollRef.current;
    // A JS `behavior` overrides the CSS reduced-motion reset, so check here.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !still ? "smooth" : "auto" });
  };

  // First layout: a deep link (#e-123) wins; live opens at the bottom, an
  // ended session at the top (read like a story).
  useLayoutEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? document.getElementById(hash) : null;
    if (target && scrollRef.current?.contains(target)) {
      target.scrollIntoView({ block: "center" });
      pinnedRef.current = false;
      setPinned(false);
    } else if (live) {
      toBottom();
    } else {
      pinnedRef.current = false;
      setPinned(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the tail only while the reader is there.
  useEffect(() => {
    if (pinnedRef.current) toBottom();
  }, [items.length, events.length, busy, error]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const at = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (at !== pinnedRef.current) {
      pinnedRef.current = at;
      setPinned(at);
    }
  };

  return (
    <div className={`${s.wrap}${fill ? ` ${s.fill}` : ""}`}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={s.scroll}
        role="log"
        aria-live="off"
        aria-label="Transcript"
        tabIndex={0}
      >
        <div className={s.col}>
          {items.length === 0 &&
            (empty ?? (
              <p className={`${s.caption} t-callout`}>
                {live ? "Waiting for the agent's first move…" : "No activity was recorded."}
              </p>
            ))}
          {items.map((item) => (
            <Row key={item.id} item={item} agent={agent} owner={ownerHandle ?? null} />
          ))}
          {busy && (
            <div className={s.working} role="status">
              <span className={`${s.agentLabel} t-caption`}>◆ {agent}</span>
              <SessionMark live size={16} />
              <span className="t-callout">{activity ?? "working"}</span>
            </div>
          )}
          {error && (
            <div className={s.error} role="alert">
              <Icon name="exclamationmark.triangle" />
              <span className="t-callout">{error}</span>
              {onReconnect && <Button onClick={onReconnect}>Reconnect</Button>}
            </div>
          )}
        </div>
      </div>
      {!pinned && items.length > 0 && (
        <button
          type="button"
          className={`${s.jump} t-callout`}
          onClick={() => {
            pinnedRef.current = true;
            setPinned(true);
            toBottom(true);
          }}
        >
          <Icon name="chevron.down" size={14} /> Jump to latest
        </button>
      )}
    </div>
  );
}

/** Rows are memoised: a live session re-folds on every frame, but only the
 *  growing tail changes, so markdown is not re-parsed for the whole log. */
const Row = memo(
  function Row({ item, agent, owner }: { item: Item; agent: string; owner: string | null }) {
    if (item.kind === "day") {
      return (
        <div className={s.day} role="separator">
          <span className="t-caption" suppressHydrationWarning>
            {new Date(item.ts).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      );
    }
    if (item.kind === "work") return <WorkRun events={item.events} />;
    return <Single event={item.event} grouped={item.grouped} agent={agent} owner={owner} />;
  },
  (a, b) =>
    a.agent === b.agent &&
    a.owner === b.owner &&
    (a.item === b.item ||
      (a.item.kind === "work" && b.item.kind === "work"
        ? a.item.events.length === b.item.events.length && a.item.id === b.item.id
        : a.item.kind === "single" && b.item.kind === "single"
          ? a.item.event === b.item.event && a.item.grouped === b.item.grouped
          : a.item.id === b.item.id)),
);

function Single({
  event: e,
  grouped,
  agent,
  owner,
}: {
  event: SessionEvent;
  grouped: boolean;
  agent: string;
  owner: string | null;
}) {
  const id = `e-${e.seq}`;
  const text = bodyText(e);
  const at = (
    <time className={s.time} dateTime={e.ts} suppressHydrationWarning>
      {time(e.ts)}
    </time>
  );
  switch (e.event_type) {
    case "prompt":
    case "viewer_comment": {
      const who = handleOf(e);
      const ownerSaid = e.event_type === "prompt" || (!!owner && who === `@${owner}`);
      const pending = e.id.startsWith("local-");
      return (
        <div id={id} className={`${s.row} ${s.said}`} data-pending={pending || undefined}>
          {!grouped && (
            <div className={s.byline}>
              <span className={`t-caption ${ownerSaid ? s.ownerName : s.viewerName}`}>
                {who === "agent" ? (owner ? `@${owner}` : "host") : who}
              </span>
              {at}
            </div>
          )}
          <div className={`${s.bubble} ${ownerSaid ? s.ownerBubble : s.viewerBubble} t-body`}>
            {text}
          </div>
          {pending && <span className={`${s.time} t-caption`}>sending…</span>}
        </div>
      );
    }
    case "response":
      return (
        <div id={id} className={s.row}>
          {!grouped && (
            <div className={s.byline}>
              <span className={`${s.agentLabel} t-caption`}>◆ {agent}</span>
              {at}
            </div>
          )}
          <div className="md t-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ScrollPre }}>
              {text}
            </ReactMarkdown>
          </div>
        </div>
      );
    case "thinking":
    case "reasoning":
      return (
        <details id={id} className={`${s.row} ${s.panel}`}>
          <summary className={s.panelHead}>
            <span className="t-caption">Reasoning</span>
            <Icon name="chevron.down" size={12} />
          </summary>
          <p className={`${s.reasoning} t-callout`}>{text}</p>
        </details>
      );
    default: {
      // input_requested / viewer_decision: a centred caption.
      const p = e.payload ?? {};
      const line =
        e.event_type === "viewer_decision"
          ? `${handleOf(e) === "agent" ? "viewer" : handleOf(e)} ${
              p.decision === "deny" ? "denied" : "allowed"
            } the request`
          : `awaiting ${p.kind === "permission" ? "permission" : "input"}`;
      return (
        <p id={id} className={`${s.caption} t-callout`}>
          {line} · {at}
        </p>
      );
    }
  }
}

/** Folded tool activity (Mac LSWorkRun): the last 6 steps until expanded;
 *  expanded, each step opens its full output or diff. Edits and writes are
 *  neutral — red is only for errors and denials. */
function WorkRun({ events }: { events: SessionEvent[] }) {
  const [open, setOpen] = useState(false);
  const n = events.length;
  const shown = open || n <= COLLAPSED_TAIL ? events : events.slice(-COLLAPSED_TAIL);
  return (
    <div id={`e-${events[0].seq}`} className={`${s.row} ${s.panel} ${s.wide}`}>
      <button
        type="button"
        className={s.panelHead}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="gearshape" size={12} />
        <span className="t-caption">
          Agent activity · {n} step{n === 1 ? "" : "s"}
        </span>
        <span className={s.chevron} data-open={open || undefined}>
          <Icon name="chevron.down" size={12} />
        </span>
      </button>
      <div className={s.steps}>
        {!open && n > COLLAPSED_TAIL && (
          <span className="t-caption">… {n - COLLAPSED_TAIL} earlier steps</span>
        )}
        {shown.map((e) =>
          open ? (
            <details key={e.id} className={s.step}>
              <summary className={`${s.stepLine} t-mono`}>{stepLine(e)}</summary>
              <StepDetail e={e} />
            </details>
          ) : (
            <div key={e.id} className={`${s.stepLine} t-mono`} title={stepLine(e)}>
              {stepLine(e)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function StepDetail({ e }: { e: SessionEvent }) {
  const p = e.payload ?? {};
  // Hooks put the tool input under `input`; some captures flatten it.
  const input = (p.input ?? p) as Record<string, unknown>;
  if (typeof input.old_string === "string" || typeof input.new_string === "string") {
    return <Diff oldS={String(input.old_string ?? "")} newS={String(input.new_string ?? "")} />;
  }
  const full =
    e.event_type === "output"
      ? bodyText(e)
      : typeof input.command === "string"
        ? `$ ${input.command}${typeof p.output === "string" ? `\n\n${p.output}` : ""}`
        : typeof input.content === "string"
          ? input.content
          : JSON.stringify(input, null, 2);
  // Scrolls on overflow, so it must take keyboard focus (WCAG 2.1.1).
  return (
    <pre className={`${s.code} t-mono`} tabIndex={0}>
      {full}
    </pre>
  );
}

/** Unified diff, removed red / added green, 80 lines then "… N more". */
export function Diff({ oldS, newS }: { oldS: string; newS: string }) {
  const [all, setAll] = useState(false);
  const lines = diffLines(oldS, newS);
  const shown = all ? lines : lines.slice(0, DIFF_CAP);
  return (
    <div className={`${s.code} t-mono`}>
      {shown.map((l, i) => (
        <div key={i} className={l.sign === "-" ? s.del : s.add}>
          {l.sign} {l.text}
        </div>
      ))}
      {lines.length > shown.length && (
        <button type="button" className={`${s.more} t-caption`} onClick={() => setAll(true)}>
          … {lines.length - shown.length} more · show all
        </button>
      )}
    </div>
  );
}
