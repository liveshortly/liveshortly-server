// App routes that need a signed-in user. The ONE list: middleware.ts (server
// redirect) and AuthGate.tsx (client fallback) both import it. middleware's
// `config.matcher` must stay a literal, so it repeats these as patterns; the
// runtime check still goes through isPrivate. Everything else is public
// (landing, feed, docs, install, changelog, session, replay, story) or a 404.
// /hud is not here: it redirects to /sessions (next.config.ts).
export const PRIVATE_PREFIXES = ["/sessions", "/new", "/profile", "/settings", "/admin"];

export const isPrivate = (p: string) =>
  PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

// Shell destinations (sidebar, ⌘K, mobile tab bar). The filter params are the
// deep-link contract with the sessions list (LSW-09).
export const ROUTES = {
  sessions: "/sessions",
  live: "/sessions?filter=live",
  shared: "/sessions?filter=shared",
  project: (repo: string) => `/sessions?project=${encodeURIComponent(repo)}`,
  newSession: "/new",
  session: (id: string) => `/session/${encodeURIComponent(id)}`,
} as const;

/** Public site links: the header, and its menu sheet under 768px (LSW-34). */
export const SITE_LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/docs", label: "Docs" },
  { href: "/install", label: "Install" },
  { href: "/changelog", label: "Changelog" },
  { href: "https://github.com/liveshortly", label: "GitHub" },
] as const;

/** Site pages rendered from content/pages/<slug>.md (LSW-36), in footer order. */
export const SITE_PAGES = [
  { slug: "about", label: "About" },
  { slug: "use-cases", label: "Use cases" },
  { slug: "pricing", label: "Pricing" },
  { slug: "security", label: "Security" },
  { slug: "privacy", label: "Privacy" },
  { slug: "terms", label: "Terms" },
] as const;
