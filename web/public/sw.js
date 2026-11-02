// LiveShortly service worker: Web Push for approval requests (LSW-21).
// Pushes carry no payload; on each one we ask the API what is pending (same
// origin, so the session cookie goes along) and show one notification per
// waiting session.

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
