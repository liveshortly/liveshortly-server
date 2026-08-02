"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSessionOnHost } from "@/lib/api";
import { useHosts } from "@/components/HostsContext";

/**
 * Start a session on one of your own machines, from the browser.
 *
 * Renders NOTHING when the account has no online host — the button would be a
 * dead end for everyone who has not run `live daemon`, and the terminal flow is
 * unchanged for them.
 *
 * The pickers are deliberately closed sets: machine, agent and directory all
 * come from what that machine registered. There is no free-text path field,
 * because the browser must never be able to name a directory the daemon did
 * not offer (see CONTRACT.md → Hosts → Security model).
 */
export default function NewSessionButton() {
  const router = useRouter();
  const hosts = useHosts();
  const [open, setOpen] = useState(false);
  const [hostId, setHostId] = useState("");
  const [agent, setAgent] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Default the pickers to the first host's first offer whenever the set of
  // machines changes (including the first load).
  useEffect(() => {
    if (!hosts || hosts.length === 0) return;
    const current = hosts.find((h) => h.id === hostId) ?? hosts[0];
    if (current.id !== hostId) setHostId(current.id);
    if (!current.agents.includes(agent)) setAgent(current.agents[0] ?? "");
    if (!current.dirs.includes(cwd)) setCwd(current.dirs[0] ?? "");
  }, [hosts, hostId, agent, cwd]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hosts || hosts.length === 0) return null;

  const host = hosts.find((h) => h.id === hostId) ?? hosts[0];

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createSessionOnHost(host.id, agent, cwd);
      if (s.spawn?.status === "failed") {
        // The session exists but the machine was never told. Say so instead of
        // navigating to a page that will sit at "waiting for agent" forever.
        setError(s.spawn.error ?? "could not reach that machine");
        setBusy(false);
        return;
      }
      setOpen(false);
      router.push(`/session/${s.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="ns-wrap" ref={panelRef}>
      <button
        type="button"
        className="ns-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Start a session on one of your machines"
      >
        + New session
      </button>

      {open && (
        <div className="ns-panel" role="dialog" aria-label="New session">
          <div className="ns-row">
            <label className="ns-label" htmlFor="ns-host">
              Machine
            </label>
            <select
              id="ns-host"
              className="ns-select"
              value={host.id}
              onChange={(e) => setHostId(e.target.value)}
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.os}/{h.arch})
                </option>
              ))}
            </select>
          </div>

          <div className="ns-row">
            <label className="ns-label" htmlFor="ns-agent">
              Agent
            </label>
            <select
              id="ns-agent"
              className="ns-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {host.agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="ns-row">
            <label className="ns-label" htmlFor="ns-dir">
              Directory
            </label>
            <select
              id="ns-dir"
              className="ns-select"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            >
              {host.dirs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="ns-error">{error}</div>}

          <button
            type="button"
            className="ns-start"
            onClick={start}
            disabled={busy || !agent || !cwd}
          >
            {busy ? "STARTING…" : `START ${agent.toUpperCase()}`}
          </button>
          <div className="ns-hint">
            Runs on {host.name}. Approve tool calls from the session page.
          </div>
        </div>
      )}
    </div>
  );
}
