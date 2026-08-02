"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { listHosts, type Host } from "@/lib/api";

const HostsContext = createContext<Host[] | null>(null);

/**
 * Polls the caller's online machines (running `live daemon`) every 20s and
 * shares the result app-wide — NewSessionButton and the daemon status pill
 * in Topbar both key off this single poll instead of each running their own.
 * `null` means "still checking", `[]` means "confirmed offline".
 */
export function HostsProvider({ children }: { children: React.ReactNode }) {
  const [hosts, setHosts] = useState<Host[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const list = await listHosts(ctrl.signal);
        if (!ctrl.signal.aborted) setHosts(list);
      } catch {
        if (!ctrl.signal.aborted) setHosts([]);
      }
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, []);

  return <HostsContext.Provider value={hosts}>{children}</HostsContext.Provider>;
}

export function useHosts(): Host[] | null {
  return useContext(HostsContext);
}
