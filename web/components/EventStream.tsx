"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionEvent } from "@/lib/api";
import { summarizePayload, localTime, truncate } from "@/lib/utils";

// Internal stream-boundary markers carry no content (just a timestamp) and
// should never show in the log. Some capture hooks emit these.
const HIDDEN_EVENT_TYPES = new Set(["stream_start", "stream_end"]);

// Event types that read as a chat bubble vs. a system-activity line.
const BUBBLE_TYPES = new Set(["prompt", "response", "viewer_comment"]);

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

/** Compact one-line descriptor for system-activity rows. */
function systemLine(e: SessionEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string) : undefined;
  const tool = str("tool_name") ?? str("tool") ?? str("name");
  const path = str("file_path") ?? str("path") ?? str("file");

  switch (e.event_type) {
    case "tool_call": {
      const detail = [tool, path].filter(Boolean).join(" · ");
      return detail || truncate(summarizePayload(p), 100);
    }
    case "file_write":
      return path ? `wrote ${path}` : truncate(summarizePayload(p), 100);
    case "output":
      return truncate(str("text") ?? summarizePayload(p), 120) || "output";
    case "input_requested": {
      const kind = str("kind") === "permission" ? "permission" : "input";
      const msg = str("message");
      return `awaiting ${kind}${msg ? ` — ${truncate(msg, 90)}` : ""}`;
    }
    default:
      return truncate(summarizePayload(p), 100);
  }
}

/**
 * Infer which earlier message a `response` is replying to: the NEAREST PRECEDING
 * prompt or viewer_comment. Walking back, whichever is encountered first is the
 * most recent — so a viewer_comment after the last prompt naturally wins.
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

/** Chat-transcript event log. Auto-scrolls to bottom when new events arrive. */
export default function EventStream({
  events: rawEvents,
  live,
  ownerHandle,
}: {
  events: SessionEvent[];
  live?: boolean;
  ownerHandle?: string | null;
}) {
  const events = rawEvents.filter((e) => !HIDDEN_EVENT_TYPES.has(e.event_type));
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const me = ownerHandle && ownerHandle.trim() ? ownerHandle.trim() : "YOU";

  // Track whether the user is pinned to the bottom.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 40;
  };

  useEffect(() => {
    if (stickRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
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

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        border: "1px solid var(--strong)",
        background: "var(--bg)",
        height: "min(64vh, 620px)",
        overflowY: "auto",
        padding: "12px 0",
      }}
    >
      {events.length === 0 ? (
        <div
          className="label"
          style={{ padding: "24px 16px", color: "var(--faint)" }}
        >
          {live
            ? "WAITING FOR EVENTS…"
            : "NO EVENTS RECORDED FOR THIS SESSION."}
        </div>
      ) : (
        events.map((e, i) => {
          const setRef = (node: HTMLDivElement | null) => {
            if (node) rowRefs.current.set(e.id, node);
            else rowRefs.current.delete(e.id);
          };

          // --- System activity rows (centered, muted) ---
          if (!BUBBLE_TYPES.has(e.event_type)) {
            const m = markerFor(e.event_type);
            return (
              <div
                key={e.id}
                ref={setRef}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "4px 12px",
                }}
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

          // --- Chat bubbles ---
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

          // Reply inference for response bubbles.
          let quote: SessionEvent | null = null;
          let addressed: string | null = null;
          if (isResponse) {
            quote = inferReplyTarget(events, i);
            const mAt = body.match(ADDRESSED_RE);
            if (mAt) addressed = mAt[1];
          }

          return (
            <div
              key={e.id}
              ref={setRef}
              style={{
                display: "flex",
                justifyContent: side === "right" ? "flex-end" : "flex-start",
                padding: "6px 12px",
              }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  minWidth: 0,
                  border: `1px solid ${accent}`,
                  borderRadius: 3,
                  background: tint,
                  [side === "right" ? "borderRight" : "borderLeft"]:
                    `3px solid ${accent}`,
                  padding: "6px 10px",
                }}
              >
                {/* sender + time */}
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

                {/* quoted reply preview */}
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
                    <span
                      className="label"
                      style={{ color: "var(--amber)", fontSize: 9 }}
                    >
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

                {/* body — markdown for Claude, plain text otherwise */}
                {isResponse ? (
                  <div className="md" style={{ fontSize: 13, color: "var(--ink)" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {body}
                    </ReactMarkdown>
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
