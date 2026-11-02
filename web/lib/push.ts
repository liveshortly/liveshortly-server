import { pushKey, savePushEndpoint } from "@/lib/api";

/** True when this browser can receive Web Push (iOS Safari only as an installed app). */
function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** True when Web Push could be on here (browser + server support it) but isn't. */
export async function pushMissing(): Promise<boolean> {
  if (!pushSupported() || !(await pushKey())) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return !(await reg?.pushManager.getSubscription());
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Turn notifications on. Call ONLY from a click handler — it may show the
 * browser's permission prompt. Asks permission, then (where Web Push is
 * supported and the server has a VAPID key) registers /sw.js and stores the
 * subscription so approvals reach this browser with the tab closed.
 * Returns the resulting permission.
 */
export async function enableNotifications(): Promise<NotificationPermission> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted" || !pushSupported()) return perm;
  try {
    const key = await pushKey();
    if (!key) return perm;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) }));
    await savePushEndpoint(sub.endpoint);
  } catch {
    // Push is an extra; in-page notifications still work without it.
  }
  return perm;
}
