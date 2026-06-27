"use client";

import { useEffect, useRef } from "react";
import type { SessionEvent } from "@/lib/api";
import { summarizePayload, localTime } from "@/lib/utils";

// Internal stream-boundary markers carry no content (just a timestamp) and
// should never show in the log. Some capture hooks emit these.
const HIDDEN_EVENT_TYPES = new Set(["stream_start", "stream_end"]);

/** Color + glyph per event_type. */
function markerFor(type: string): { color: string; glyph: string } {
  switch (type) {
    case "prompt":
      return { color: "var(--amber)", glyph: "›" };
    case "response":
      return { color: "var(--green)", glyph: "‹" };
    case "tool_call":
      return { color: "var(--ink)", glyph: "⚙" };
    case "file_write":
      return { color: "var(--red)", glyph: "✎" };
    case "output":
      return { color: "var(--muted)", glyph: "·" };
    case "viewer_comment":
      return { color: "var(--green)", glyph: "✉" };
    default:
      return { color: "var(--faint)", glyph: "•" };
  }
}

/** Terminal-style event log. Auto-scrolls to bottom when new events arrive. */
export default function EventStream({
  events: rawEvents,
  live,
}: {
  events: SessionEvent[];
  live?: boolean;
}) {
  const events = rawEvents.filter((e) => !HIDDEN_EVENT_TYPES.has(e.event_type));
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

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

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        border: "1px solid var(--strong)",
        background: "var(--panel)",
        height: "min(64vh, 620px)",
        overflowY: "auto",
        padding: "10px 0",
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
        events.map((e) => {
          const m = markerFor(e.event_type);
          const text = summarizePayload(e.payload);

          // Inbound human messages read as a distinct, right-aligned bubble.
          if (e.event_type === "viewer_comment") {
            const handle =
              typeof e.payload?.username === "string"
                ? (e.payload.username as string)
                : (e.actor ?? "viewer");
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "6px 12px",
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    minWidth: 0,
                    border: "1px solid var(--green)",
                    background: "color-mix(in srgb, var(--green) 7%, var(--panel))",
                    borderRight: "3px solid var(--green)",
                    padding: "6px 10px",
                  }}
                >
                  <div
                    className="label tnum"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      color: "var(--green)",
                      fontSize: 10,
                      marginBottom: 3,
                    }}
                  >
                    <span>✉ VIEWER @{handle}</span>
                    <span style={{ color: "var(--faint)" }} title={e.ts}>
                      {localTime(e.ts)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--ink)",
                    }}
                  >
                    {typeof e.payload?.message === "string"
                      ? (e.payload.message as string)
                      : text}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "62px 16px 1fr",
                gap: 8,
                padding: "5px 12px",
                alignItems: "baseline",
                borderLeft: `2px solid transparent`,
              }}
            >
              <span
                className="label tnum"
                style={{ color: "var(--faint)", fontSize: 11 }}
                title={e.ts}
              >
                {localTime(e.ts)}
              </span>
              <span
                aria-hidden
                style={{ color: m.color, fontWeight: 700, textAlign: "center" }}
              >
                {m.glyph}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  className="label"
                  style={{ color: m.color, marginRight: 8, fontSize: 10 }}
                >
                  {e.event_type}
                  {e.actor ? `·${e.actor}` : ""}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--ink)",
                  }}
                >
                  {text}
                </span>
              </span>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );
}
