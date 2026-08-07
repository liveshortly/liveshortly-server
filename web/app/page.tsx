"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Authenticated visitors land on / (e.g. after login) — send them straight
 *  to the sessions browser instead of the old home feed. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sessions");
  }, [router]);
  return null;
}
