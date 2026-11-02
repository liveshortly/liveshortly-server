// Copies the CHANGELOG files the /changelog page renders into web/content/changelog/.
// Runs as `prebuild`. The sources live outside web/ (server repo root, and the
// sibling `live` CLI repo), which the Docker build context (./web) can't see, so
// the copies are committed and a missing source just keeps the committed copy.
// Override the CLI path with LIVE_CHANGELOG=/path/to/live/CHANGELOG.md.
//
// The CLI changelog is read from the `live` repo's origin/main, not its working
// tree: a checkout sitting on an old feature branch would otherwise silently
// drop released versions from the page.
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
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
