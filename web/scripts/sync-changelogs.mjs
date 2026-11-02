// Copies the CHANGELOG files the /changelog page renders into web/content/changelog/.
// Runs as `prebuild`. The sources live outside web/ (server repo root, and the
// sibling `live` CLI repo), which the Docker build context (./web) can't see, so
// the copies are committed and a missing source just keeps the committed copy.
// Override the CLI path with LIVE_CHANGELOG=/path/to/live/CHANGELOG.md.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const sources = {
  "live.md": process.env.LIVE_CHANGELOG ?? here("../../../live/CHANGELOG.md"),
  "server.md": here("../../CHANGELOG.md"),
};

for (const [name, src] of Object.entries(sources)) {
  if (existsSync(src)) {
    copyFileSync(src, here(`../content/changelog/${name}`));
    console.log(`changelog: ${src} -> content/changelog/${name}`);
  } else {
    console.log(`changelog: ${src} not found, keeping committed content/changelog/${name}`);
  }
}
