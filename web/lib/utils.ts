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
    case "ollama":
      return "Ollama";
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

/** Title-case agent name for the mobile feed (Codex / Claude / Gemini). */
export function agentTitle(fw: string | null | undefined): string {
  switch (fw) {
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "gemini-cli":
      return "Gemini";
    case "ollama":
      return "Ollama";
    default:
      return frameworkLabel(fw);
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

/** Human byte size (KB/MB/GB, base-1024) — e.g. 104857600 → "100 MB". */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // One decimal under 10, none above — "9.4 MB", "100 MB".
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** A very subtle status tint for session tiles: a faint green wash for live,
 *  a barely-there gray wash for ended. Theme-aware — mixes over --panel so it
 *  works in both light and dark. */
export function tileBg(status: "live" | "ended"): string {
  return status === "live"
    ? "color-mix(in srgb, var(--green) 4%, var(--panel))"
    : "color-mix(in srgb, var(--faint) 5%, var(--panel))";
}

/** Truncate a string to `max` chars (collapsing whitespace), adding an ellipsis. */
export function truncate(s: string, max = 80): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}
