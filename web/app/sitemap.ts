import type { MetadataRoute } from "next";
import { SLUGS } from "./docs/docs";
import { SITE_PAGES } from "@/lib/routes";
import { SITE_URL } from "@/lib/install";

/** /sitemap.xml: every public, server-rendered page (LSW-36). scripts/check-pages.mjs checks every URL in it. */
const PUBLIC_PATHS = [
  "/",
  "/feed",
  "/install",
  "/install/self-host",
  "/changelog",
  "/docs",
  ...SLUGS.map((s) => `/docs/${s}`),
  ...SITE_PAGES.map((p) => `/${p.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, "");
  return PUBLIC_PATHS.map((p) => ({ url: `${base}${p === "/" ? "" : p}` }));
}
