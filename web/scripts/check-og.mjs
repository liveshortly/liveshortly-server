// Share-card check (LSW-45). Run after `next build`:
//   og:image and twitter:image on `/` must be absolute https URLs whose file
//   exists (200 image/png, under 1 MB) and is 1200x630.
// Run: node scripts/check-og.mjs                      (starts `next start` itself)
//      OG_URL=http://localhost:3000 node scripts/check-og.mjs   (existing server)
import { spawn } from "node:child_process";

let base = process.env.OG_URL;
let server;
if (!base) {
  const port = process.env.OG_PORT ?? "3124";
  base = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", port], { stdio: "ignore", detached: true });
  for (let i = 0; !(await fetch(base).then(() => true, () => false)); i++) {
    if (i > 60) throw new Error(`server did not start on ${base}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

let failed = 0;
const fail = (m) => (failed++, console.error("FAIL", m));
try {
  const html = await (await fetch(base + "/")).text();
  for (const key of ["og:image", "twitter:image"]) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]*>`))?.[0];
    const url = tag?.match(/content="([^"]+)"/)?.[1];
    if (!url) { fail(`${key}: tag missing`); continue; }
    if (!/^https:\/\//.test(url)) { fail(`${key}: not absolute https: ${url}`); continue; }
    // The file is served by the build under test, not the live site.
    const res = await fetch(base + new URL(url).pathname);
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200 || !res.headers.get("content-type")?.includes("image/png")) { fail(`${key}: ${url} is not a 200 image/png`); continue; }
    if (buf.length > 1_000_000) fail(`${key}: ${buf.length} bytes (max 1 MB)`);
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (w !== 1200 || h !== 630) fail(`${key}: ${w}x${h}, want 1200x630`);
    else console.log(`ok ${key} ${url} ${w}x${h} ${buf.length}B`);
  }
} finally {
  if (server) process.kill(-server.pid);
}
process.exit(failed ? 1 : 0);
