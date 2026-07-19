"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionEvent } from "@/lib/api";
import { agentTitle, localTime } from "@/lib/utils";
import Avatar from "@/components/Avatar";

// Same boundary/work-type rules as EventStream — kept in sync deliberately
// rather than shared, since the two renderers group events differently
// (EventStream folds work into its own collapsible row; this nests it
// under the turn that produced it, matching design/session-viewer-mobile.html).
const HIDDEN_EVENT_TYPES = new Set(["stream_start", "stream_end"]);
const WORK_TYPES = new Set(["tool_call", "file_write", "output"]);
const BUBBLE_TYPES = new Set(["prompt", "response", "viewer_comment"]);

type Turn = { event: SessionEvent; work: SessionEvent[] };

/** Groups events into chat turns, attaching any tool/file/output activity to
 *  the turn that PRECEDED it — i.e. the prompt that triggered the work, which
 *  then leads into Claude's response (matching design/session-viewer-mobile.html:
 *  the work rows nest under the host's "Prompt" turn, and the response bubble
 *  stays clean). Work seen before any turn (rare) is returned as `leadingWork`. */
function buildTurns(events: SessionEvent[]): {
  turns: Turn[];
  leadingWork: SessionEvent[];
} {
  const turns: Turn[] = [];
  const leadingWork: SessionEvent[] = [];
  for (const e of events) {
    if (WORK_TYPES.has(e.event_type)) {
      // Attach to the current (most recent) turn — the prompt this work
      // belongs to. Trailing work in a live session (response not in yet)
      // therefore also nests under its prompt rather than floating loose.
      if (turns.length > 0) turns[turns.length - 1].work.push(e);
      else leadingWork.push(e);
      continue;
    }
    if (BUBBLE_TYPES.has(e.event_type)) {
      turns.push({ event: e, work: [] });
    }
    // input_requested / viewer_decision / unknown types are surfaced
    // elsewhere (InputRequestBanner) and don't get their own turn here.
  }
  return { turns, leadingWork };
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function bodyText(e: SessionEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  for (const k of ["message", "text", "content"]) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function handleOf(e: SessionEvent, fallback: string): string {
  const u = (e.payload as Record<string, unknown>)?.username;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (e.actor && e.actor !== "agent") return e.actor;
  return fallback;
}

function workLine(e: SessionEvent): { swatch: "tool" | "write"; text: string } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  if (e.event_type === "file_write") {
    const path = str("file_path") ?? str("path") ?? str("file") ?? "file";
    return { swatch: "write", text: `Write ${path}` };
  }
  const tool = str("tool_name") ?? str("tool") ?? str("name");
  const detail = str("file_path") ?? str("path") ?? str("command");
  return {
    swatch: "tool",
    text: [tool, detail].filter(Boolean).join(": ") || e.event_type,
  };
}

function WorkRows({ events }: { events: SessionEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="mfeed-work">
      {events.map((e) => {
        const { swatch, text } = workLine(e);
        return (
          <div key={e.id} className="mfeed-toolrow" title={text}>
            <span className={`mfeed-sw mfeed-sw-${swatch}`} aria-hidden />
            <span className="mfeed-toolrow-text">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Mobile-only unified feed: Claude, the host, and viewers all post into one
 *  thread — tool/write activity renders as small swatched lines nested under
 *  the turn that produced it instead of a separate event log. Desktop keeps
 *  the richer EventStream (collapsible work blocks, reply quoting, markdown). */
export default function MobileEventFeed({
  events: rawEvents,
  live,
  ownerHandle,
  framework,
}: {
  events: SessionEvent[];
  live?: boolean;
  ownerHandle?: string | null;
  framework?: string | null;
}) {
  const events = rawEvents.filter((e) => !HIDDEN_EVENT_TYPES.has(e.event_type));
  const { turns, leadingWork } = buildTurns(events);
  const owner = ownerHandle && ownerHandle.trim() ? ownerHandle.trim() : "you";
  const agent = agentTitle(framework);

  // Auto-scroll the feed's scroll container (the .mobile-feed-wrap parent) to
  // the bottom as new events arrive — unless the viewer has scrolled up to read.
  const rootRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const scroller = rootRef.current?.parentElement;
    if (scroller && stick.current) scroller.scrollTop = scroller.scrollHeight;
  }, [events.length]);
  useEffect(() => {
    const scroller = rootRef.current?.parentElement;
    if (!scroller) return;
    const onScroll = () => {
      stick.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  if (turns.length === 0 && leadingWork.length === 0) {
    return (
      <div className="label" style={{ padding: "24px 16px", color: "var(--faint)" }}>
        {live ? "WAITING FOR EVENTS…" : "NO EVENTS RECORDED FOR THIS SESSION."}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      {leadingWork.length > 0 && (
        <div className="mfeed-msg">
          <div className="mfeed-avatar mfeed-avatar-claude" aria-hidden>
            ⌐
          </div>
          <div className="mfeed-body">
            <div className="mfeed-head">
              <span className="mfeed-name mfeed-name-claude">{agent}</span>
            </div>
            <WorkRows events={leadingWork} />
          </div>
        </div>
      )}

      {turns.map(({ event: e, work }) => {
        const isPrompt = e.event_type === "prompt";
        const isResponse = e.event_type === "response";
        const role: "claude" | "host" | "viewer" = isResponse
          ? "claude"
          : isPrompt
            ? "host"
            : "viewer";
        const name =
          role === "claude" ? agent : `@${handleOf(e, role === "host" ? owner : "viewer")}`;
        const avatarText = role === "claude" ? "⌐" : initials(name.replace(/^@/, ""));

        return (
          <div key={e.id} className="mfeed-msg">
            {role === "claude" ? (
              <div className="mfeed-avatar mfeed-avatar-claude" aria-hidden>
                {avatarText}
              </div>
            ) : (
              <Avatar
                seed={name.replace(/^@/, "")}
                size={24}
                className={`mfeed-avatar mfeed-avatar-${role}`}
                title={name}
              />
            )}
            <div className="mfeed-body">
              <div className="mfeed-head">
                <span className={`mfeed-name mfeed-name-${role}`}>{name}</span>
                {isPrompt && <span className="mfeed-tag">Prompt</span>}
                <span className="mfeed-time tnum">{localTime(e.ts)}</span>
              </div>
              <div className="mfeed-bubble">
                {role === "claude" ? (
                  // Claude responses carry markdown (headings, lists, code,
                  // tables) — render it via the shared `.md` typography, same as
                  // desktop EventStream. `.md pre`/`table` already scroll
                  // horizontally so long content can't blow out the bubble.
                  <div className="md" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {bodyText(e)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  // User-typed prompts / viewer comments stay literal text.
                  bodyText(e)
                )}
              </div>
              {/* Tool/file activity nests under the turn that triggered it
                  (the prompt), below its bubble — per the mockup. */}
              <WorkRows events={work} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
