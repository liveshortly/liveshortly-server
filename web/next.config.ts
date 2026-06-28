import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
