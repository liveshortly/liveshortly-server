// LiveShortly service worker: Web Push for approval requests (LSW-21) and the
// installable app's offline fallback + static cache (LSW-19).
// Pushes carry no payload; on each one we ask the API what is pending (same
// origin, so the session cookie goes along) and show one notification per
// waiting session.

// ── Offline + static cache (LSW-19) ─────────────────────────────────────
// Deliberately narrow: only the static /offline page (and its CSS) and
// content-hashed /_next/static files the server marks immutable. Never API
// responses, never page HTML — sessions and everything signed-in always come
// from the network. Bump CACHE to drop everything on the next activate.
const CACHE = "ls-static-v1";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const res = await fetch(OFFLINE, { credentials: "omit", cache: "no-store" });
        if (!res.ok) return;
        await cache.put(OFFLINE, res.clone());
        // Its stylesheets, so the page looks right with no network.
        const css = (await res.text()).match(/\/_next\/static\/[^"'\s]+\.css/g) || [];
        await cache.addAll([...new Set(css)]);
      } catch {
        // No offline page is fine; never let it block the push worker installing.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ls-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network; the cached offline page only when it fails.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()),
    );
    return;
  }

  // Hashed build assets: cache-first, and only what the server calls immutable
  // (prod sets that; `next dev` doesn't, so dev never serves a stale chunk).
  // ponytail: no size cap — old hashes pile up until CACHE is bumped.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && /immutable/.test(res.headers.get("Cache-Control") || "")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })(),
    );
  }
  // Everything else (API, auth, images, public files) goes straight to the network.
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let approvals = [];
      try {
        const res = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
        if (res.ok) approvals = (await res.json()).approvals || [];
      } catch {
        // offline / signed out: fall through to the generic notice
      }
      if (approvals.length === 0) {
        // Browsers require a visible notification for every push.
        return self.registration.showNotification("Approval needed · LiveShortly", {
          body: "An agent is waiting for your answer.",
          tag: "ls-approval",
          data: { url: "/sessions" },
        });
      }
      await Promise.all(
        approvals.map((a) =>
          self.registration.showNotification("Approval needed · LiveShortly", {
            body: `${a.title}: ${a.message || "An agent is asking permission."}`,
            tag: `ls-approval-${a.session_id}`,
            data: { url: `/session/${a.session_id}` },
          }),
        ),
      );
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/sessions", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.find((w) => w.url === url);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
