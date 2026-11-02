"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthContext";
import { useSessions } from "@/components/SessionsContext";
import { markSeen, type Session } from "@/lib/api";

/** Server-side read mark (LSW-32): while the page is visible and signed in,
 *  record `seq` (the newest event shown) as seen — debounced, so a busy live
 *  session posts about once a second, not per event — and clear the shell
 *  sidebar's badge right away instead of waiting for its next poll. */
export function useMarkSeen(id: string, seq: number) {
  const me = useAuth();
  const { patch } = useSessions();
  const patchRef = useRef(patch); // changes every shell poll; don't re-run on it
  patchRef.current = patch;

  useEffect(() => {
    if (!me || seq < 1) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      markSeen(id, seq)
        .then(() => patchRef.current({ id, unread: 0 } as Session))
        .catch(() => {}); // best-effort: the badge just stays until next open
    };
    const t = setTimeout(mark, 1000);
    document.addEventListener("visibilitychange", mark);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [id, seq, me]);
}
