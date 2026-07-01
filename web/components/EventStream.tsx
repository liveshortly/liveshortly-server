"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionEvent } from "@/lib/api";
import { summarizePayload, localTime, truncate } from "@/lib/utils";

// Internal stream-boundary markers carry no content (just a timestamp) and
// should never show in the log. Some capture hooks emit these.
const HIDDEN_EVENT_TYPES = new Set(["stream_start", "stream_end"]);

// Event types that read as a chat bubble.
const BUBBLE_TYPES = new Set(["prompt", "response", "viewer_comment"]);

// Consecutive runs of these fold into a collapsible "work block" — Claude's
// actions between a prompt and its response (design/session-viewer.html).
const WORK_TYPES = new Set(["tool_call", "file_write", "output"]);

/** Color + glyph per event_type. */
function markerFor(type: string): { color: string; glyph: string } {
  switch (type) {
    case "prompt":
      return { color: "var(--amber)", glyph: "›" };
    case "response":
      return { color: "var(--green)", glyph: "◆" };
    case "tool_call":
      return { color: "var(--ink)", glyph: "⚙" };
    case "file_write":
      return { color: "var(--red)", glyph: "✎" };
    case "output":
      return { color: "var(--muted)", glyph: "·" };
    case "viewer_comment":
      return { color: "var(--amber)", glyph: "✉" };
    case "input_requested":
      return { color: "var(--amber)", glyph: "⌐" };
    case "viewer_decision":
      return { color: "var(--green)", glyph: "⏎" };
    default:
      return { color: "var(--faint)", glyph: "•" };
  }
}

/** Plain text body of an event (prompt / viewer_comment / response). */
function bodyText(e: SessionEvent): string {
  const p = e.payload ?? {};
  for (const k of ["message", "text", "content"]) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return summarizePayload(p);
}

/** Sender handle for a prompt / viewer_comment, if present in the payload. */
function handleOf(e: SessionEvent, fallback: string): string {
  const u = (e.payload as Record<string, unknown>)?.username;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (e.actor && e.actor !== "agent") return e.actor;
  return fallback;
}

/** {verb, path, detail} for a single work-step row. */
function workStep(e: SessionEvent): {
  verb: string;
  path: string;
  detail: string;
} {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string) : undefined;
  const tool = str("tool_name") ?? str("tool") ?? str("name");
  const path = str("file_path") ?? str("path") ?? str("file");
  switch (e.event_type) {
    case "file_write":
      return {
        verb: "Wrote",
        path: path ?? truncate(summarizePayload(p), 60),
        detail: str("detail") ?? str("lines") ?? "",
      };
    case "tool_call":
      return {
        verb: tool ? cap(tool) : "Run",
        path: path ?? str("command") ?? truncate(summarizePayload(p), 60),
        detail: "",
      };
    case "output":
      return { verb: "Output", path: truncate(str("text") ?? summarizePayload(p), 80), detail: "" };
    default:
      return { verb: e.event_type, path: truncate(summarizePayload(p), 70), detail: "" };
  }
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Compact one-line descriptor for stray system-activity rows (rare types). */
function systemLine(e: SessionEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string) : undefined;
  switch (e.event_type) {
    case "input_requested": {
      const kind = str("kind") === "permission" ? "permission" : "input";
      const msg = str("message");
      return `awaiting ${kind}${msg ? ` — ${truncate(msg, 90)}` : ""}`;
    }
    case "viewer_decision": {
      const who = str("username") ?? "viewer";
      return str("decision") === "deny"
        ? `${who} denied the request`
        : `${who} allowed the request`;
    }
    default:
      return truncate(summarizePayload(p), 100);
  }
}

/**
 * Infer which earlier message a `response` is replying to: the NEAREST PRECEDING
 * prompt or viewer_comment.
 */
function inferReplyTarget(
  events: SessionEvent[],
  index: number,
): SessionEvent | null {
  for (let i = index - 1; i >= 0; i--) {
    const t = events[i].event_type;
    if (t === "viewer_comment" || t === "prompt") return events[i];
  }
  return null;
}

const ADDRESSED_RE = /^@([A-Za-z0-9_.\-]+)\s*:/;

/** A rendering item: either a single event or a folded run of work events. */
type Item =
  | { kind: "event"; event: SessionEvent; index: number }
  | { kind: "work"; events: SessionEvent[]; index: number };

function group(events: SessionEvent[]): Item[] {
  const items: Item[] = [];
  let run: SessionEvent[] = [];
  let runStart = 0;
  const flush = () => {
    if (run.length) {
      items.push({ kind: "work", events: run, index: runStart });
      run = [];
    }
  };
  events.forEach((e, i) => {
    if (WORK_TYPES.has(e.event_type)) {
      if (run.length === 0) runStart = i;
      run.push(e);
    } else {
      flush();
      items.push({ kind: "event", event: e, index: i });
    }
  });
  flush();
  return items;
}

/** Chat-transcript event log. Auto-scrolls to bottom when new events arrive. */
export default function EventStream({
  events: rawEvents,
  live,
  ownerHandle,
  fill,
}: {
  events: SessionEvent[];
  live?: boolean;
  ownerHandle?: string | null;
  /** Grow to fill the parent (two-pane viewer) instead of a fixed height. */
  fill?: boolean;
}) {
  const events = rawEvents.filter((e) => !HIDDEN_EVENT_TYPES.has(e.event_type));
  const items = group(events);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const me = ownerHandle && ownerHandle.trim() ? ownerHandle.trim() : "YOU";

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 40;
  };

  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  const scrollToEvent = (id: string) => {
    const el = rowRefs.current.get(id);
    if (!el) return;
    stickRef.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate(
      [
        { boxShadow: "0 0 0 2px var(--amber)" },
        { boxShadow: "0 0 0 2px transparent" },
      ],
      { duration: 1100, easing: "ease-out" },
    );
  };

  const setRef = (id: string) => (node: HTMLDivElement | null) => {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        border: "1px solid var(--strong)",
        background: "var(--bg)",
        ...(fill
          ? { flex: 1, minHeight: 0 }
          : { height: "min(64vh, 620px)" }),
        overflowY: "auto",
        padding: "12px 0",
      }}
    >
      {items.length === 0 ? (
        <div className="label" style={{ padding: "24px 16px", color: "var(--faint)" }}>
          {live ? "WAITING FOR EVENTS…" : "NO EVENTS RECORDED FOR THIS SESSION."}
        </div>
      ) : (
        items.map((item) => {
          if (item.kind === "work") {
            return (
              <WorkBlock
                key={`work-${item.events[0].id}`}
                events={item.events}
                setRef={setRef}
              />
            );
          }
          const e = item.event;

          // Stray system rows (input_requested / viewer_decision / unknown).
          if (!BUBBLE_TYPES.has(e.event_type)) {
            const m = markerFor(e.event_type);
            return (
              <div
                key={e.id}
                ref={setRef(e.id)}
                style={{ display: "flex", justifyContent: "center", padding: "4px 12px" }}
              >
                <div
                  className="label tnum"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    maxWidth: "82%",
                    border: "1px solid var(--hairline)",
                    background: "var(--panel)",
                    color: "var(--muted)",
                    padding: "3px 10px",
                    fontSize: 10,
                  }}
                  title={systemLine(e)}
                >
                  <span style={{ color: m.color }}>{m.glyph}</span>
                  <span style={{ color: m.color }}>{e.event_type}</span>
                  <span
                    style={{
                      color: "var(--muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    {systemLine(e)}
                  </span>
                  <span style={{ color: "var(--faint)" }}>{localTime(e.ts)}</span>
                </div>
              </div>
            );
          }

          // Chat bubbles.
          const isPrompt = e.event_type === "prompt";
          const isResponse = e.event_type === "response";
          const isViewer = e.event_type === "viewer_comment";
          const side: "left" | "right" = isPrompt ? "right" : "left";

          const accent = isResponse
            ? "var(--green)"
            : isViewer
              ? "var(--amber)"
              : "var(--strong)";
          const tint = isResponse
            ? "var(--panel)"
            : isViewer
              ? "color-mix(in srgb, var(--amber) 8%, var(--panel))"
              : "color-mix(in srgb, var(--amber) 6%, var(--panel))";

          const senderLabel = isResponse
            ? "◆ CLAUDE"
            : isViewer
              ? `✉ @${handleOf(e, "viewer")} · VIEWER`
              : me === "YOU"
                ? "YOU"
                : `@${handleOf(e, me)} · YOU`;

          const body = bodyText(e);

          let quote: SessionEvent | null = null;
          let addressed: string | null = null;
          if (isResponse) {
            quote = inferReplyTarget(events, item.index);
            const mAt = body.match(ADDRESSED_RE);
            if (mAt) addressed = mAt[1];
          }

          return (
            <div
              key={e.id}
              ref={setRef(e.id)}
              style={{
                display: "flex",
                justifyContent: side === "right" ? "flex-end" : "flex-start",
                padding: "6px 12px",
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  minWidth: 0,
                  border: `1px solid ${accent}`,
                  borderRadius: 3,
                  background: tint,
                  [side === "right" ? "borderRight" : "borderLeft"]:
                    `3px solid ${accent}`,
                  padding: "6px 10px",
                }}
              >
                <div
                  className="label tnum"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    color: accent,
                    fontSize: 10,
                    marginBottom: 4,
                  }}
                >
                  <span>{senderLabel}</span>
                  <span style={{ color: "var(--faint)" }} title={e.ts}>
                    {localTime(e.ts)}
                  </span>
                </div>

                {isResponse && quote && (
                  <button
                    type="button"
                    onClick={() => scrollToEvent(quote!.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderLeft: "3px solid var(--amber)",
                      background: "color-mix(in srgb, var(--amber) 9%, var(--panel))",
                      padding: "3px 8px",
                      marginBottom: 6,
                      cursor: "pointer",
                    }}
                    title="Jump to the message this replies to"
                  >
                    <span className="label" style={{ color: "var(--amber)", fontSize: 9 }}>
                      ↩ REPLYING TO{" "}
                      {quote.event_type === "viewer_comment"
                        ? `@${handleOf(quote, addressed ?? "viewer")} · VIEWER`
                        : addressed
                          ? `@${addressed}`
                          : me === "YOU"
                            ? "YOU"
                            : `@${handleOf(quote, me)}`}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {truncate(bodyText(quote), 80)}
                    </span>
                  </button>
                )}

                {isResponse ? (
                  <div className="md" style={{ fontSize: 13, color: "var(--ink)" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--ink)",
                    }}
                  >
                    {body}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );
}

/** A collapsible block of Claude's actions (tool calls / file writes / output). */
function WorkBlock({
  events,
  setRef,
}: {
  events: SessionEvent[];
  setRef: (id: string) => (node: HTMLDivElement | null) => void;
}) {
  // Expanded by default for short runs; folded for long ones.
  const [open, setOpen] = useState(events.length <= 6);

  const files = events.filter((e) => e.event_type === "file_write").length;
  const runs = events.filter((e) => e.event_type === "tool_call").length;
  const start = new Date(events[0].ts).getTime();
  const end = new Date(events[events.length - 1].ts).getTime();
  const dur = Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? end - start
    : 0;

  return (
    <div ref={setRef(events[0].id)} style={{ padding: "6px 12px" }}>
      <div
        style={{
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          borderLeft: "3px solid var(--muted)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="label tnum"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            background: "transparent",
            color: "var(--muted)",
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          <span style={{ color: "var(--faint)" }}>{open ? "▾" : "▸"}</span>
          <span style={{ color: "var(--green)" }}>◆ CLAUDE</span>
          <span>· {events.length} step{events.length === 1 ? "" : "s"}</span>
          {files > 0 && <Chip tone="red">{files} file{files === 1 ? "" : "s"}</Chip>}
          {runs > 0 && <Chip tone="ink">{runs} run{runs === 1 ? "" : "s"}</Chip>}
          {dur > 0 && (
            <span style={{ marginLeft: "auto", color: "var(--faint)" }}>
              {dur < 1000 ? `${dur}ms` : `${(dur / 1000).toFixed(1)}s`}
            </span>
          )}
        </button>
        {open && (
          <div style={{ borderTop: "1px solid var(--hairline)" }}>
            {events.map((e) => {
              const { verb, path, detail } = workStep(e);
              const m = markerFor(e.event_type);
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "4px 10px 4px 24px",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: m.color }}>{m.glyph}</span>
                  <span className="label" style={{ color: m.color, fontSize: 10 }}>
                    {verb}
                  </span>
                  <span
                    className="tnum"
                    style={{
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                    title={path}
                  >
                    {path}
                  </span>
                  {detail && (
                    <span className="label" style={{ color: "var(--faint)" }}>
                      {detail}
                    </span>
                  )}
                  <span
                    className="label tnum"
                    style={{ marginLeft: "auto", color: "var(--faint)", flexShrink: 0 }}
                  >
                    {localTime(e.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "red" | "ink" }) {
  return (
    <span
      style={{
        border: `1px solid ${tone === "red" ? "var(--red)" : "var(--hairline)"}`,
        color: tone === "red" ? "var(--red)" : "var(--muted)",
        padding: "1px 6px",
        fontSize: 9,
      }}
    >
      {children}
    </span>
  );
}
