"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { me as fetchMe } from "@/lib/api";

/**
 * Client-side admin gate for admin pages. Resolves the identity and redirects
 * non-admins (or signed-out visitors) to "/". This is the web layer of the
 * three-layer gate; the API independently returns 403, so a non-admin who
 * reaches the route still gets no data. Returns the current phase.
 */
export function useAdminGuard(): "checking" | "ok" | "denied" {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "ok" | "denied">("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const m = await fetchMe(ctrl.signal);
        if (!m.authenticated || !m.is_admin) {
          setPhase("denied");
          router.replace("/");
          return;
        }
        setPhase("ok");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setPhase("denied");
        router.replace("/");
      }
    })();
    return () => ctrl.abort();
  }, [router]);
  return phase;
}
