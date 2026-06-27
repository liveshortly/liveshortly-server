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

/** Zero-padded number for fixed-width displays. */
export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Thousands-grouped integer with locale separators. */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

/** HH:MM:SS UTC clock string for a given Date. */
export function utcClock(d: Date = new Date()): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}

/** Absolute UTC time of day, HH:MM:SS, from an ISO timestamp. */
export function utcTime(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return utcClock(d);
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
