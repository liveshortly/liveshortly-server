// Docs pages live in content/docs/<slug>.md; this list sets the nav order.
// cli-reference.md is generated from `live --help` (scripts/gen-cli-ref.mjs).
// Server-only: reads fs.
import { readFileSync } from "node:fs";
import path from "node:path";

export const SLUGS = [
  "getting-started",
  "watching-and-commenting",
  "approvals",
  "sharing",
  "publishing",
  "forks-and-handoff",
  "web-sessions",
  "agents",
  "pocketai",
  "self-hosting",
  "build-from-source",
  "cli-reference",
  "api",
  "troubleshooting",
  "faq",
  "glossary",
];

export interface Heading {
  depth: 2 | 3;
  text: string;
  id: string;
}

export interface DocPage {
  slug: string;
  title: string;
  summary: string; // first paragraph: what you'll do and what you need
  body: string; // markdown without the # title
  headings: Heading[];
}

/** Heading text → anchor id. The renderer uses the same function on the rendered text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/[ -]+/g, "-");
}

// Inline markdown → the plain text it renders as (headings only use code and links).
const plain = (md: string) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").replace(/&lt;/g, "<");

export function loadDoc(slug: string): DocPage | null {
  if (!SLUGS.includes(slug)) return null;
  const src = readFileSync(path.join(process.cwd(), "content/docs", `${slug}.md`), "utf8");
  const [first, ...rest] = src.split("\n");
  const body = rest.join("\n").trim();
  const headings: Heading[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const m = !fenced && line.match(/^(##|###) (.+)$/);
    if (m) {
      const text = plain(m[2]);
      headings.push({ depth: m[1].length as 2 | 3, text, id: slugify(text) });
    }
  }
  return {
    slug,
    title: first.replace(/^# /, ""),
    summary: plain(body.split("\n\n")[0]),
    body,
    headings,
  };
}

export const loadAll = () => SLUGS.map((s) => loadDoc(s)!);
