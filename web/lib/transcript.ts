// Transcript model for the session view (LSW-04) — a port of the Mac's
// LSSessionModel fold (Mac/LiveShortly/LSSessionModel.swift) and LSActivity.
// Pure and import-free so `node scripts/check-transcript.mjs` can run it.
import type { SessionEvent } from "./api";

type P = Record<string, unknown>;
const str = (p: unknown, k: string): string | undefined => {
  const v = (p as P | null | undefined)?.[k];
  return typeof v === "string" && v.trim() ? v : undefined;
};

/** Events that stand alone in the thread; everything else folds into a work run. */
const BREAKERS = new Set([
  "prompt",
  "response",
  "viewer_comment",
  "input_requested",
  "viewer_decision",
  "thinking",
  "reasoning",
]);
/** Turn markers: break a run, render nothing. */
const MARKERS = new Set(["stream_start", "stream_end", "session_ended"]);

export type Item =
  | { kind: "day"; id: string; ts: string }
  | { kind: "single"; id: string; event: SessionEvent; grouped: boolean }
  | { kind: "work"; id: string; events: SessionEvent[] };

/** Human text of an event (prompt / comment / reply / output). */
export function bodyText(e: SessionEvent): string {
  for (const k of ["message", "text", "content", "prompt"]) {
    const v = str(e.payload, k);
    if (v) return v;
  }
  return "";
}

/** Who an event came from: "@handle", a non-agent actor, or "agent". */
export function handleOf(e: SessionEvent): string {
  const u = str(e.payload, "username");
  if (u) return `@${u.trim()}`;
  if (e.actor && e.actor !== "agent") return e.actor;
  return "agent";
}

const dayKey = (iso: string) => new Date(iso).toDateString();

/**
 * Rows for the transcript: day separators, single rows (grouped when the
 * previous row is the same type and author within 300 s) and folded work runs.
 */
export function foldEvents(events: SessionEvent[]): Item[] {
  const items: Item[] = [];
  let run: SessionEvent[] | null = null;
  let last: SessionEvent | null = null;
  for (const e of events) {
    if (!last || dayKey(last.ts) !== dayKey(e.ts)) {
      items.push({ kind: "day", id: `d${e.seq}`, ts: e.ts });
      run = null;
    }
    if (MARKERS.has(e.event_type)) {
      run = null;
    } else if (BREAKERS.has(e.event_type)) {
      run = null;
      const grouped =
        !!last &&
        last.event_type === e.event_type &&
        handleOf(last) === handleOf(e) &&
        Date.parse(e.ts) - Date.parse(last.ts) < 300_000;
      items.push({ kind: "single", id: `e${e.seq}`, event: e, grouped });
    } else if (run) {
      run.push(e);
    } else {
      run = [e];
      items.push({ kind: "work", id: `w${e.seq}`, events: run });
    }
    last = e;
  }
  return items;
}

/** Mac `agentBusy`: the newest turn-relevant event says the agent is working. */
export function agentBusy(events: SessionEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    switch (events[i].event_type) {
      case "response":
      case "session_ended":
      case "stream_end":
      case "input_requested":
        return false;
      case "prompt":
      case "viewer_comment":
      case "tool_call":
      case "pre_tool":
      case "file_write":
      case "output":
      case "stream_start":
        return true;
    }
  }
  return false;
}

const base = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** LSActivity.label: "thinking", "running bash", "editing X", "waiting for you"… */
export function activityLabel(events: SessionEvent[]): string {
  let e: SessionEvent | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].event_type;
    if (t !== "viewer_comment" && !MARKERS.has(t)) {
      e = events[i];
      break;
    }
  }
  if (!e) return "working";
  const p = e.payload;
  const input = (p?.input ?? {}) as P;
  switch (e.event_type) {
    case "file_write": {
      const path = str(p, "file_path") ?? str(p, "path") ?? str(p, "file");
      return path ? `editing ${base(path)}` : "editing";
    }
    case "tool_call":
    case "pre_tool": {
      const tool = str(p, "tool") ?? str(p, "tool_name") ?? str(p, "name");
      if (!tool) return "running";
      const path = str(input, "file_path") ?? str(p, "file_path");
      switch (tool) {
        case "Edit":
        case "MultiEdit":
        case "Write":
        case "NotebookEdit":
          return path ? `editing ${base(path)}` : "editing";
        case "Read":
          return path ? `reading ${base(path)}` : "reading";
        case "Grep":
        case "Glob":
          return "searching";
        case "WebSearch":
        case "WebFetch":
          return "searching the web";
        default:
          return `running ${tool.toLowerCase()}`;
      }
    }
    case "output":
    case "response":
      return "writing";
    case "prompt":
    case "thinking":
    case "reasoning":
      return "thinking";
    case "input_requested":
      return "waiting for you";
    default:
      return "working";
  }
}

/** Activity after a request means the agent moved on (the web never blocks it). */
const SUPERSEDES = new Set([
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
]);

/** The newest unanswered input_requested event, or null. */
export function pendingProbe(events: SessionEvent[]): SessionEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].event_type;
    if (t === "input_requested") return events[i];
    if (SUPERSEDES.has(t)) return null;
  }
  return null;
}

/** The tool call a permission probe asks about: the last tool_call before it
 *  in the same turn (the capture hook emits the full tool input first). */
export function toolCallBefore(
  events: SessionEvent[],
  probe: SessionEvent,
): SessionEvent | null {
  if (str(probe.payload, "kind") !== "permission") return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.seq >= probe.seq) continue;
    if (e.event_type === "tool_call") return e;
    if (["prompt", "response", "viewer_comment"].includes(e.event_type)) return null;
  }
  return null;
}

/** "Bash · git push" / "Edit · page.tsx" / "tool" — the bar's one-line gist. */
export function toolSummary(call: SessionEvent): string {
  const tool = str(call.payload, "tool") ?? str(call.payload, "tool_name") ?? "tool";
  const input = (call.payload?.input ?? {}) as P;
  let gist: string | undefined;
  if (tool === "Bash" || tool === "Shell") {
    gist = (str(input, "command") ?? str(call.payload, "command"))?.split("\n")[0];
  } else if (["Edit", "Write", "MultiEdit", "Read", "NotebookEdit"].includes(tool)) {
    const path = str(input, "file_path");
    gist = path && base(path);
  }
  return gist ? `${tool} · ${gist}` : tool;
}

/** One line for a work step, Mac `LSWorkRun.line` wording. */
export function stepLine(e: SessionEvent): string {
  const p = e.payload;
  const tool = str(p, "tool") ?? str(p, "tool_name");
  const input = (p?.input ?? {}) as P;
  switch (e.event_type) {
    case "tool_call": {
      const cmd =
        str(p, "command") ?? str(input, "command") ?? str(input, "file_path") ??
        str(input, "pattern") ?? str(input, "url");
      return cmd ? `› ${tool ?? "Bash"} ${cmd}` : `› ${tool ?? "tool"}`;
    }
    case "pre_tool":
      return `› ${str(p, "action") ?? "running"} ${tool ?? ""}`.trimEnd();
    case "file_write":
      return `› ${tool ?? "Edit"} ${str(p, "file") ?? str(p, "file_path") ?? str(p, "path") ?? ""}`.trimEnd();
    case "output": {
      const t = bodyText(e);
      return t ? `  ${t}` : "› output";
    }
    default: {
      const t = bodyText(e);
      return t ? `› ${t}` : `› ${e.event_type}`;
    }
  }
}

/** Names typing now, Mac `typingLine` wording. */
export function typingLine(names: string[]): string | null {
  const n = [...names].sort();
  if (n.length === 0) return null;
  if (n.length === 1) return `${n[0]} is typing…`;
  if (n.length === 2) return `${n[0]} and ${n[1]} are typing…`;
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]} are typing…`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} others are typing…`;
}

/** Unified-diff lines for an Edit's old/new strings. */
export function diffLines(oldS: string, newS: string): { sign: "-" | "+"; text: string }[] {
  return [
    ...oldS.split("\n").map((text) => ({ sign: "-" as const, text })),
    ...newS.split("\n").map((text) => ({ sign: "+" as const, text })),
  ];
}
