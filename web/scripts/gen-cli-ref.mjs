// Generates content/docs/cli-reference.md from `live --help`. Runs as part of
// `prebuild`. The CLI lives in the sibling `live` repo, which the Docker build
// context (./web) can't see, so the output is committed and a missing CLI just
// keeps the committed copy (same pattern as sync-changelogs.mjs).
//
//   LIVE_BIN=/path/to/live   use a built binary instead of `go run ./cmd/live`
//   LIVE_REPO=/path/to/live  CLI checkout (default: ../../../live)
//   --check                  exit 1 if the committed page is out of date (CI)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../content/docs/cli-reference.md");
const repo = process.env.LIVE_REPO ?? here("../../../live");
const check = process.argv.includes("--check");

function help() {
  if (process.env.LIVE_BIN) return execFileSync(process.env.LIVE_BIN, ["--help"], { encoding: "utf8" });
  if (!existsSync(`${repo}/cmd/live`)) return null;
  try {
    return execFileSync("go", ["run", "./cmd/live", "--help"], { cwd: repo, encoding: "utf8" });
  } catch (e) {
    console.log(`cli-ref: go run failed (${e.message.split("\n")[0]})`);
    return null;
  }
}

// Placeholders like <id> would otherwise parse as HTML tags.
const esc = (s) => s.replace(/</g, "&lt;");
const cell = (s) => esc(s).replace(/\|/g, "\\|");

// The help text is groups ("Heading:") of two-space-indented lines. A line with
// a 2+ space gap is an item (term + description; deeper-indented lines continue
// it), anything else is prose.
function toMarkdown(text) {
  const lines = text.replace(/\s+$/, "").split("\n");
  const md = [
    "# CLI reference",
    "",
    "Every `live` command and flag. This page is generated from `live --help`; run `live --help` to see the same text for the version you have installed.",
    "",
  ];
  let items = []; // pending { term, desc }
  let prose = [];
  const flushProse = () => {
    if (prose.length) md.push(esc(prose.join(" ")), "");
    prose = [];
  };
  const flushItems = () => {
    const cmds = items.filter((i) => i.term.startsWith("live"));
    const opts = items.filter((i) => !i.term.startsWith("live"));
    for (const i of cmds) md.push(`### \`${i.term}\``, "", esc(i.desc), "");
    if (opts.length) {
      md.push("| Name | What it does |", "| --- | --- |");
      for (const i of opts) md.push(`| \`${i.term.replace(/\|/g, "\\|")}\` | ${cell(i.desc)} |`);
      md.push("");
    }
    items = [];
  };

  for (const line of lines.slice(1)) {
    const group = line.match(/^(\S.*):$/);
    const item = line.match(/^ {2}(\S.*?) {2,}(\S.*)$/);
    if (group) {
      flushProse();
      flushItems();
      md.push(`## ${group[1]}`, "");
    } else if (/^ {6,}\S/.test(line) && items.length && !prose.length) {
      items[items.length - 1].desc += " " + line.trim();
    } else if (item) {
      flushProse();
      items.push({ term: item[1], desc: item[2] });
    } else if (line.trim() === "") {
      flushProse();
    } else {
      flushItems();
      prose.push(line.trim());
    }
  }
  flushProse();
  flushItems();
  md.push("## Full `live --help` output", "", "```text", text.replace(/\s+$/, ""), "```", "");
  return md.join("\n").replace(/\n{3,}/g, "\n\n");
}

const text = help();
if (text == null) {
  if (check) {
    console.error(`cli-ref: no CLI at ${repo}; set LIVE_REPO or LIVE_BIN`);
    process.exit(1);
  }
  console.log(`cli-ref: live CLI not found at ${repo}, keeping committed content/docs/cli-reference.md`);
} else {
  const md = toMarkdown(text);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (current !== md) {
      console.error("cli-ref: content/docs/cli-reference.md is out of date; run node scripts/gen-cli-ref.mjs");
      process.exit(1);
    }
    console.log("cli-ref: up to date");
  } else {
    writeFileSync(out, md);
    console.log(`cli-ref: live --help -> content/docs/cli-reference.md`);
  }
}
