// Freshness check for the public pages (LSW-36). Run after `next build`:
//   1. every URL in /sitemap.xml returns 200 and has at least MIN_WORDS words of
//      text in <body> (streamed chunks included; the header and legal line add
//      about 25), so a page shell with no content fails;
//   2. no docs/site page uses a `live` flag that `live --help` (the committed
//      content/docs/cli-reference.md, from gen-cli-ref.mjs) doesn't know.
//
// Run: node scripts/check-pages.mjs              (starts `next start` itself)
//      PAGES_URL=http://localhost:3000 node scripts/check-pages.mjs
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const MIN_WORDS = 250;
// Pages whose body is mostly live data, which is empty with no API behind the
// server: hold them to a lower bar.
const MIN_OVERRIDE = { "/": 60, "/feed": 30, "/install/self-host": 150, "/docs": 150 };

// Flags `live` accepts that `live --help` does not list (daemon --server mode),
// and flags that belong to the wrapped agent, not to live.
const KNOWN_FLAGS = new Set([
  "--server", "--listen", "--name", "--key", "--tls-cert", "--tls-key", "--agents-file", "--state-dir",
  "--list", "--watch", "--read-only",
  "--dangerously-skip-permissions", "--permission-mode", "--yolo", "--approval-mode", "--ask-for-approval",
  "--dangerously-bypass-approvals-and-sandbox", "--experimental-acp", "--print", "--interactive",
]);

let failed = 0;
const fail = (msg) => {
  failed++;
  console.error(`✗ ${msg}`);
};

// ---- 2. flags (no server needed) ----
const help = readFileSync(here("../content/docs/cli-reference.md"), "utf8");
const helpFlags = new Set(help.match(/--[a-z][a-z-]*/g));
const sources = [
  ...readdirSync(here("../content/docs")).map((f) => `content/docs/${f}`),
  ...readdirSync(here("../content/pages")).map((f) => `content/pages/${f}`),
].filter((f) => f.endsWith(".md") && !f.endsWith("cli-reference.md"));
for (const f of sources) {
  readFileSync(here(`../${f}`), "utf8")
    .split("\n")
    .forEach((line, i) => {
      // Only lines that run live: `live …` in a code block or inline code.
      for (const cmd of line.match(/(?:^|`|\s)live (?:[^`\n#]*)/g) ?? []) {
        for (const flag of cmd.match(/(?<=\s)--[a-z][a-z-]*/g) ?? []) {
          if (!helpFlags.has(flag) && !KNOWN_FLAGS.has(flag)) fail(`${f}:${i + 1} uses ${flag}, which live --help doesn't list`);
        }
      }
    });
}

// ---- 1. sitemap routes ----
let server;
let base = process.env.PAGES_URL;
if (!base) {
  const port = process.env.PAGES_PORT ?? "3124";
  base = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", port], { stdio: "ignore", detached: true });
  for (let i = 0; ; i++) {
    if (await fetch(base).then(() => true, () => false)) break;
    if (i > 60) throw new Error(`server did not start on ${base}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

try {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  if (paths.length === 0) fail("sitemap.xml lists no pages");
  for (const p of paths) {
    const res = await fetch(base + p, { signal: AbortSignal.timeout(15000) });
    if (res.status !== 200) {
      fail(`${p} returned ${res.status}`);
      continue;
    }
    const body = (await res.text()).match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "";
    const words = body
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/g, " ")
      .split(/\s+/)
      .filter((w) => /\w/.test(w)).length;
    const min = MIN_OVERRIDE[p] ?? MIN_WORDS;
    if (words < min) fail(`${p} has ${words} words of body text (minimum ${min})`);
    else console.log(`✓ ${p} (${words} words)`);
  }
} finally {
  if (server) process.kill(-server.pid);
}

if (failed) {
  console.error(`\n${failed} problem(s)`);
  process.exit(1);
}
console.log("\npages: ok");
