import type { MetadataRoute } from "next";

// Installable web app (LSW-19). Colours mirror --canvas / --accent in
// app/tokens.css (a manifest can't read CSS variables); the per-scheme
// theme-color meta lives in app/layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/sessions",
    name: "LiveShortly",
    short_name: "LiveShortly",
    description: "Watch, steer and share your coding-agent sessions.",
    start_url: "/sessions",
    scope: "/",
    display: "standalone",
    background_color: "#F3F1E9",
    theme_color: "#F3F1E9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
