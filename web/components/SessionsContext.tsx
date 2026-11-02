"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listSessions, type Session } from "@/lib/api";

const POLL_MS = 5000;

type Sessions = {
  /** null = still loading. */
  mine: Session[] | null;
  shared: Session[] | null;
  /** Server-side counts (lists above hold at most one 100-row page). */
  totals: { mine: number; shared: number };
  patch: (u: Session) => void;
  drop: (id: string) => void;
};

const Ctx = createContext<Sessions>({ mine: null, shared: null, totals: { mine: 0, shared: 0 }, patch: () => {}, drop: () => {} });

/**
 * The shell's one session poll: the sidebar, the ⌘K palette and the mobile tab
 * bar all read it. Reloads on ⌘R (the `ls:refresh` event, see Shortcuts.tsx).
 */
export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  // The API caps a page at 100; the sidebar's "All (N)" needs the real count.
  const [totals, setTotals] = useState({ mine: 0, shared: 0 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [m, s] = await Promise.all([
          listSessions({ scope: "mine", status: "all", limit: 100 }),
          listSessions({ scope: "shared", status: "all", limit: 100 }),
        ]);
        if (!alive) return;
        setMine(m.results);
        setShared(s.results);
        setTotals({ mine: m.total, shared: s.total });
      } catch {
        // keep the last good list on a transient error
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener("ls:refresh", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("ls:refresh", load);
    };
  }, []);

  const value = useMemo(() => {
    const map = (u: Session) => (arr: Session[] | null) =>
      arr?.map((x) => (x.id === u.id ? { ...x, ...u } : x)) ?? arr;
    const filt = (id: string) => (arr: Session[] | null) => arr?.filter((x) => x.id !== id) ?? arr;
    return {
      mine,
      shared,
      totals,
      patch: (u: Session) => {
        setMine(map(u));
        setShared(map(u));
      },
      drop: (id: string) => {
        setMine(filt(id));
        setShared(filt(id));
      },
    };
  }, [mine, shared, totals]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSessions = () => useContext(Ctx);

/** Newest first by last activity. */
export const byRecent = (a: Session, b: Session) =>
  +new Date(b.ended_at ?? b.created_at) - +new Date(a.ended_at ?? a.created_at);
