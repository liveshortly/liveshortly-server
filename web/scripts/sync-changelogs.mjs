// Copies the CHANGELOG files the /changelog page renders into web/content/changelog/.
// Runs as `prebuild`. The sources live outside web/ (server repo root, and the
// sibling `live` CLI repo), which the Docker build context (./web) can't see, so
// the copies are committed and a missing source just keeps the committed copy.
// Override the CLI path with LIVE_CHANGELOG=/path/to/live/CHANGELOG.md.
//
// The CLI changelog is read from the `live` repo's origin/main, not its working
// tree: a checkout sitting on an old feature branch would otherwise silently
// drop released versions from the page.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = (name) => here(`../content/changelog/${name}`);

function liveFromMain() {
  try {
    return execFileSync("git", ["-C", here("../../../live"), "show", "origin/main:CHANGELOG.md"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

const live = process.env.LIVE_CHANGELOG ? null : liveFromMain();
if (live) {
  writeFileSync(out("live.md"), live);
  console.log("changelog: live origin/main:CHANGELOG.md -> content/changelog/live.md");
}

const sources = {
  ...(live ? {} : { "live.md": process.env.LIVE_CHANGELOG ?? here("../../../live/CHANGELOG.md") }),
  "server.md": here("../../CHANGELOG.md"),
};

for (const [name, src] of Object.entries(sources)) {
  if (existsSync(src)) {
    copyFileSync(src, out(name));
    console.log(`changelog: ${src} -> content/changelog/${name}`);
  } else {
    console.log(`changelog: ${src} not found, keeping committed content/changelog/${name}`);
  }
}

// Harness support matrix (LSH-08), generated in the live repo from internal/harness.
// docs/harness-matrix.json feeds the /new agent picker; the README's table (between
// the harness-matrix markers) replaces the same block in content/docs/agents.md.
// Same rule as above: no live repo (Docker build) keeps the committed copies.
const fromLive = (path) => {
  try {
    return execFileSync("git", ["-C", here("../../../live"), "show", `origin/main:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};
const matrix = fromLive("docs/harness-matrix.json");
if (matrix) {
  writeFileSync(here("../content/harness-matrix.json"), matrix);
  console.log("harness: live origin/main:docs/harness-matrix.json -> content/harness-matrix.json");
}
const block = /<!-- harness-matrix:start -->[\s\S]*?<!-- harness-matrix:end -->/;
const table = fromLive("README.md")?.match(block)?.[0];
if (table) {
  const doc = here("../content/docs/agents.md");
  writeFileSync(doc, readFileSync(doc, "utf8").replace(block, () => table));
  console.log("harness: live README matrix -> content/docs/agents.md");
} else {
  console.log("harness: live repo not available, keeping committed matrix copies");
}
