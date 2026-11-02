// Server-side pick of the landing replay (LSW-10): a REAL public session, read
// cookie-less, cut down to a few transcript lines so the full event log never
// ships to the browser.
import { apiBase, type SessionDetail, type SessionEvent, type Session } from "@/lib/api";
import { truncate } from "@/lib/utils";

export type ReplayLine = { kind: "you" | "agent" | "tool"; text: string };
export type Replay = {
  id: string;
  title: string;
  owner_handle: string;
  framework: string | null;
  model: string | null;
  lines: ReplayLine[];
};

const MAX_LINES = 12;
const MAX_TOOL_RUN = 2; // a long run of commands shows its first two

// Defence in depth: the API redacts public payloads (LSW-23); strip home dirs
// anyway, so an API that predates that never puts local paths on the landing.
export const scrub = (s: string) =>
  s.replace(/(?:\/Users|\/home)\/[^/\s"'`]+/g, "~").replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "~");

function str(p: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** A short, readable transcript: prompts, tool commands, answers. */
export function replayLines(events: SessionEvent[]): ReplayLine[] {
  const out: ReplayLine[] = [];
  let toolRun = 0;
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    let line: ReplayLine | null = null;
    if (e.event_type === "prompt" || e.event_type === "viewer_comment") {
      const t = str(p, "message", "text", "content");
      if (t) line = { kind: "you", text: truncate(scrub(t), 160) };
    } else if (e.event_type === "response") {
      const t = str(p, "content", "text", "message");
      if (t) line = { kind: "agent", text: truncate(scrub(t).replace(/[*`#]+/g, ""), 220) };
    } else if (e.event_type === "pre_tool" || e.event_type === "tool_call") {
      const cmd = str(p, "command");
      const file = str(p, "file", "file_path", "path");
      const tool = str(p, "tool", "tool_name");
      const t = cmd ? `$ ${cmd}` : file ? `${tool || "Edit"} ${file}` : "";
      if (t) line = { kind: "tool", text: truncate(scrub(t), 90) };
    }
    if (!line || out.at(-1)?.text === line.text) continue; // pre_tool + tool_call = one step
    toolRun = line.kind === "tool" ? toolRun + 1 : 0;
    if (toolRun > MAX_TOOL_RUN) continue;
    out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** Scrubbed copies of feed rows for the public landing. */
export function scrubSessions(rows: Session[]): Session[] {
  return rows.map((r) => ({ ...r, title: scrub(r.title), hero: r.hero ? scrub(r.hero) : r.hero }));
}

/**
 * The admin-chosen session (LANDING_REPLAY_ID) or the newest ended, open
 * (anonymously readable) session on the public feed. No cookies are sent, so
 * only what an anonymous visitor may read can come back.
 */
export async function pickReplay(recent: Session[], signal: AbortSignal): Promise<Replay | null> {
  const ids = [
    process.env.LANDING_REPLAY_ID,
    ...recent
      .filter((s) => s.visibility === "open" && s.status === "ended" && s.event_count >= 8)
      .map((s) => s.id),
  ].filter((id): id is string => !!id);

  for (const id of ids.slice(0, 3)) {
    try {
      // ponytail: cached 10 min so a landing hit doesn't bump view_count each
      // time; bodies over Next's 2 MB fetch-cache limit just aren't cached.
      const res = await fetch(`${apiBase()}/api/sessions/${encodeURIComponent(id)}`, {
        signal,
        credentials: "omit",
        headers: { accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (!res.ok) continue;
      const s = (await res.json()) as SessionDetail;
      if (s.visibility !== "open") continue;
      const lines = replayLines(s.events ?? []);
      if (lines.length < 4) continue;
      return {
        id: s.id,
        title: scrub(s.title),
        owner_handle: s.owner_handle,
        framework: s.framework,
        model: s.model,
        lines,
      };
    } catch {
      // try the next one; no replay at all is a valid outcome
    }
  }
  return null;
}
