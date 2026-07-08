// Small formatting helpers — all pure, no deps.

/** Compact "Xs ago" / "Xm ago" relative time from an ISO timestamp. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 1) return "now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** First 8 chars of a uuid, uppercased. */
export function shortId(id: string): string {
  if (!id) return "--------";
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Human-friendly label for a session's capture framework. */
export function frameworkLabel(fw: string | null | undefined): string {
  switch (fw) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "gemini-cli":
      return "Gemini";
    case "terminal":
      return "Terminal";
    case null:
    case undefined:
    case "":
      return "—";
    default:
      return fw;
  }
}

/** Zero-padded number for fixed-width displays. */
export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Thousands-grouped integer with locale separators. */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

/** A very subtle status tint for session tiles: a faint green wash for live,
 *  a barely-there gray wash for ended. Theme-aware — mixes over --panel so it
 *  works in both light and dark. */
export function tileBg(status: "live" | "ended"): string {
  return status === "live"
    ? "color-mix(in srgb, var(--green) 4%, var(--panel))"
    : "color-mix(in srgb, var(--faint) 5%, var(--panel))";
}

/** HH:MM:SS UTC clock string for a given Date. */
export function utcClock(d: Date = new Date()): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}

/** HH:MM:SS clock string in the viewer's LOCAL timezone. */
export function localClock(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Short local timezone abbreviation (e.g. "PST", "IST"); falls back to "LOCAL". */
export function tzAbbrev(d: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    }).formatToParts(d);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value;
    if (tz && !/^GMT/i.test(tz)) return tz.toUpperCase();
    // GMT±H form — keep it compact.
    if (tz) return tz.replace(/\s+/g, "").toUpperCase();
  } catch {
    // ignore
  }
  return "LOCAL";
}

/** Absolute UTC time of day, HH:MM:SS, from an ISO timestamp. */
export function utcTime(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return utcClock(d);
}

/** Time of day, HH:MM:SS, in the viewer's LOCAL timezone, from an ISO timestamp. */
export function localTime(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Best-effort one-line summary of an arbitrary event payload. */
export function summarizePayload(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "";
  const prefer = [
    "text",
    "message",
    "content",
    "command",
    "summary",
    "name",
    "tool",
    "tool_name",
    "path",
    "file",
    "file_path",
  ];
  for (const k of prefer) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

/** Truncate a string to `max` chars (collapsing whitespace), adding an ellipsis. */
export function truncate(s: string, max = 80): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}
