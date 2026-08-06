import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the file-tracing root to this directory. Next otherwise INFERS it by
  // walking up for a lockfile, and any stray package-lock.json in a parent
  // directory (a home dir, a monorepo checkout) silently nests the standalone
  // output — server.js ends up under .next/standalone/<abs/path/to>/web/ instead
  // of at the root, and the deploy ships a bundle with no entrypoint. The Docker
  // build never hit this because its context was only ./web.
  outputFileTracingRoot: projectRoot,
  // Local dev only matters here: in production web + api sit behind ONE domain
  // (a reverse proxy routes /api, /auth, /device to the api), so the browser's
  // same-origin relative URLs just work. Locally they're separate origins
  // (:3000 vs :8000) with no proxy, so /auth/google/login and every browser
  // /api/* call 404 on the web server. Re-create that single origin by proxying
  // those prefixes to the api over the docker network. No-op in prod (the real
  // proxy answers first / API_INTERNAL_URL points at the api service).
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://api:8000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/auth/:path*", destination: `${api}/auth/:path*` },
      { source: "/device", destination: `${api}/device` },
      { source: "/device/:path*", destination: `${api}/device/:path*` },
    ];
  },
  async headers() {
    // The HTML documents reference content-hashed JS/CSS bundles. If a shared
    // cache (CDN) holds the HTML for a long time, it keeps pointing at the OLD
    // bundle hashes after a deploy, so UI changes never appear. Make the HTML
    // always revalidate; the hashed assets under /_next/static stay immutable.
    const revalidate = [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
    ];
    return [
      { source: "/", headers: revalidate },
      { source: "/session/:id*", headers: revalidate },
      // /install lists the current release. It is prerendered, so without this
      // it ships Next's default `s-maxage=31536000` — a shared cache may serve
      // the page naming an OLD version for up to a year after a release, while
      // /install/latest.txt (a public file, uncached) correctly says the new
      // one. That split is what makes a fresh release look like it did not
      // happen.
      { source: "/install", headers: revalidate },
      { source: "/install/latest.txt", headers: revalidate },
    ];
  },
};

export default nextConfig;
