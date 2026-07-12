import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
    ];
  },
};

export default nextConfig;
