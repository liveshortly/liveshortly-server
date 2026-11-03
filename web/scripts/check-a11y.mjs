// axe-core (WCAG 2.2 A/AA rules) over the public pages, light and dark, on a
// phone and a desktop viewport. Exits 1 on any serious/critical violation.
//
// Run: npm run a11y        (builds, then this script starts `next start`)
//      A11Y_URL=http://localhost:3000 node scripts/check-a11y.mjs   (existing server)
// Chrome: CHROME_PATH, else the usual macOS / Linux install paths.
// Signed-in pages need the API + a session cookie and are NOT checked here.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const PAGES = ["/", "/docs", "/docs/getting-started", "/install", "/changelog", "/feed", "/privacy", "/use-cases", "/no-such-page"];
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844, isMobile: true, hasTouch: true },
];
const FAIL_ON = new Set(["serious", "critical"]);

const chrome =
  process.env.CHROME_PATH ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(existsSync);
if (!chrome) throw new Error("No Chrome found; set CHROME_PATH");

const axeSrc = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

let server;
let base = process.env.A11Y_URL;
if (!base) {
  const port = process.env.A11Y_PORT ?? "3123";
  base = `http://127.0.0.1:${port}`;
  // No API: the proxied /api calls fail and pages show their signed-out /
  // empty states. Server logs only with A11Y_VERBOSE=1 (they are all proxy errors).
  // Own process group, so the kill below also stops next's child processes.
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", port], {
    stdio: ["ignore", "ignore", process.env.A11Y_VERBOSE ? "inherit" : "ignore"],
    detached: true,
  });
  for (let i = 0; ; i++) {
    if (await fetch(base).then(() => true, () => false)) break;
    if (i > 60) throw new Error(`server did not start on ${base}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"] });
let failing = 0;
let minor = 0;
try {
  for (const vp of VIEWPORTS)
    for (const theme of ["light", "dark"])
      for (const path of PAGES) {
        const page = await browser.newPage();
        await page.setViewport(vp);
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
        // The PWA service worker would cache across pages; idle2 tolerates polling.
        await page.setBypassServiceWorker(true);
        await page.goto(base + path, { waitUntil: "networkidle2" });
        // Check the settled page: jump finite entrance animations (the landing
        // replay fades lines in) to their end, or axe measures text mid-fade.
        await page.evaluate(() =>
          document.getAnimations().forEach((a) => {
            if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish();
          }),
        );
        await page.addScriptTag({ path: axeSrc });
        const violations = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
          });
          return r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => n.target.join(" ")),
          }));
        });
        await page.close();
        const tag = `${path} [${theme} ${vp.width}px]`;
        if (!violations.length) console.log(`ok   ${tag}`);
        for (const v of violations) {
          const bad = FAIL_ON.has(v.impact);
          bad ? failing++ : minor++;
          console.log(`${bad ? "FAIL" : "warn"} ${tag} ${v.impact} ${v.id}: ${v.help}`);
          for (const n of v.nodes.slice(0, 5)) console.log(`       ${n}`);
        }
      }
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
console.log(`\n${failing} serious/critical, ${minor} moderate/minor violation(s)`);
process.exit(failing ? 1 : 0);
