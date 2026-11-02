// Parses the CHANGELOG copies in content/changelog/ (synced at build time by
// scripts/sync-changelogs.mjs) for the /changelog page. Server-only: reads fs.
import { readFileSync } from "node:fs";
import path from "node:path";

export type Component = "CLI" | "Web & Server";

export interface Release {
  id: string; // anchor, e.g. "v2.2.1" (CLI) or "web-v4.0.0" / "web-2026-06-30"
  component: Component;
  version: string | null;
  date: string; // YYYY-MM-DD
  title: string | null;
  intro: string; // markdown before the first ### section
  sections: { title: string; body: string }[];
}

// Keep-a-Changelog headings -> the page's New / Improved / Fixed wording.
const SECTION_NAMES: Record<string, string> = {
  added: "New",
  new: "New",
  changed: "Improved",
  improved: "Improved",
  fixed: "Fixed",
};

function read(name: string): string {
  return readFileSync(path.join(process.cwd(), "content/changelog", name), "utf8");
}

function splitSections(body: string) {
  const [intro, ...rest] = body.split(/^### /m);
  return {
    intro: intro.trim(),
    sections: rest.map((chunk) => {
      const nl = chunk.indexOf("\n");
      const raw = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
      return {
        title: SECTION_NAMES[raw.toLowerCase()] ?? raw,
        body: nl < 0 ? "" : chunk.slice(nl).trim(),
      };
    }),
  };
}

// "## " blocks: [heading line, body].
function blocks(md: string): [string, string][] {
  return md
    .split(/^## /m)
    .slice(1)
    .map((b) => {
      const nl = b.indexOf("\n");
      return nl < 0 ? [b.trim(), ""] : [b.slice(0, nl).trim(), b.slice(nl)];
    });
}

function parseCli(md: string): Release[] {
  const out: Release[] = [];
  for (const [head, body] of blocks(md)) {
    // "v2.2.1 — 2026-10-23"; "Unreleased" has no version and is skipped.
    const m = head.match(/^(v\d+\.\d+\.\d+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    out.push({ id: m[1], component: "CLI", version: m[1], date: m[2], title: null, ...splitSections(body) });
  }
  return out;
}

function parseServer(md: string): Release[] {
  const out: Release[] = [];
  const seen = new Set<string>();
  for (const [head, body] of blocks(md)) {
    // "2026-07-08 — v4.0.0" | "2026-07-07 — Session handoff / fork" | "2026-06-30"
    const m = head.match(/^(\d{4}-\d{2}-\d{2})(?:\s+[—-]\s+(.+))?$/);
    if (!m) continue;
    const version = m[2]?.match(/^v\d+\.\d+\.\d+$/) ? m[2] : null;
    let id = `web-${version ?? m[1]}`;
    for (let n = 2; seen.has(id); n++) id = `web-${version ?? m[1]}-${n}`;
    seen.add(id);
    out.push({
      id,
      component: "Web & Server",
      version,
      date: m[1],
      title: version ? null : (m[2] ?? null),
      ...splitSections(body),
    });
  }
  return out;
}

/** All releases, newest first, plus the latest CLI release for the top card. */
export function loadChangelog() {
  const cli = parseCli(read("live.md"));
  const server = parseServer(read("server.md"));
  // Fail the build loudly if a CHANGELOG format change breaks parsing.
  if (!cli.length || !server.length) {
    throw new Error("changelog: no releases parsed from content/changelog/*.md");
  }
  // Stable sort keeps each file's own order within a date.
  const releases = [...cli, ...server].sort((a, b) => b.date.localeCompare(a.date));
  return { latest: cli[0], releases };
}
