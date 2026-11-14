"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { useHosts } from "@/components/HostsContext";
import InstallCommand from "@/components/InstallCommand";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import {
  CLAUDE_MODELS,
  createSessionOnHost,
  listHosts,
  type AgentModels,
  type Host,
} from "@/lib/api";
import { INSTALL_CMD } from "@/lib/install";
import { spawnAgentCaps, timeAgo } from "@/lib/utils";
import harness from "@/content/harness-matrix.json";
import s from "./new.module.css";

/** `/new?agent=x` from the sidebar's New-session menu; only honoured when the
 *  picked machine actually registered that agent. */
const requestedAgent = () =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("agent");

/** `/new?fork=<id>&from=<name>` — "Continue session": the created session forks
 *  the source (seeded context + inherited shares + "<name> fork-N" title). */
const forkSource = () =>
  typeof window === "undefined"
    ? { id: null as string | null, name: null as string | null }
    : {
        id: new URLSearchParams(window.location.search).get("fork"),
        name: new URLSearchParams(window.location.search).get("from"),
      };

/** The server expires a registration after a few minutes; past this the
 *  machine is probably gone (same threshold as LSHost.isOnline on the Mac). */
const ONLINE_MS = 180_000;
const isOnline = (h: Host) => {
  const t = Date.parse(h.seen_at);
  return Number.isNaN(t) || Date.now() - t < ONLINE_MS;
};

/** Display names for the agents we know. Hosts may advertise any safe-named
 *  agent (CONTRACT.md → Hosts), so anything else shows its raw name. */
const AGENT_NAMES: Record<string, string> = {
  claude: "Claude Code",
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  ollama: "Ollama",
  antigravity: "Antigravity",
  agy: "Antigravity",
};

/** What `live <agent>` supports, from the CLI's generated harness matrix
 *  (content/harness-matrix.json, synced at prebuild). Rows with a `mode` are a
 *  non-default way of running the agent and only appear in the docs; the last
 *  row covers every other command. */
function harnessRow(agent: string) {
  const name = agent === "claude-code" ? "claude" : agent;
  const rows = harness.rows as { agents: string[]; mode?: string; summary: string; gaps: string }[];
  return rows.find((r) => !r.mode && r.agents.includes(name)) ?? rows[rows.length - 1];
}

/** Models the user may pick for an agent on this host (LSH-16): the list the
 *  daemon registered for that agent. A server that predates agent_models gets
 *  the old rule: Claude's fixed aliases, ollama's pulled models. */
function modelsFor(host: Host, agent: string): AgentModels {
  const entry = host.agent_models?.find((e) => e.name === agent);
  if (entry) return entry;
  if (host.agent_models) return { name: agent, models: [] };
  const ids = agent === "claude" ? CLAUDE_MODELS : agent === "ollama" ? (host.models ?? []) : [];
  return { name: agent, models: ids.map((id) => ({ id })), model_switchable: agent === "claude" };
}

/** The last model picked per machine + agent, so the next session starts on it. */
const modelKey = (hostId: string, agent: string) => `ls:new-model:${hostId}:${agent}`;
function rememberedModel(host: Host, agent: string): string {
  try {
    const id = localStorage.getItem(modelKey(host.id, agent)) ?? "";
    return modelsFor(host, agent).models.some((m) => m.id === id) ? id : "";
  } catch {
    return "";
  }
}
function rememberModel(hostId: string, agent: string, id: string) {
  try {
    if (id) localStorage.setItem(modelKey(hostId, agent), id);
    else localStorage.removeItem(modelKey(hostId, agent));
  } catch {
    // Private mode / blocked storage: just don't remember.
  }
}

/** The OS account the daemon runs as, read off its registered home paths
 *  (/Users/<u>/… or /home/<u>/…) — the contract carries no user field. */
function osUser(host: Host): string {
  const parts = (host.dirs[0] ?? "").split("/").filter(Boolean);
  if (parts.length > 1 && (parts[0] === "Users" || parts[0] === "home"))
    return `${parts[1]} on ${host.name}`;
  return `The daemon's account on ${host.name}`;
}

const repoName = (dir: string) => dir.split("/").filter(Boolean).pop() ?? dir;

/**
 * New agent session (LSW-08) — the web twin of the Mac's LSNewSessionView.
 * Fields in the Mac's order: Machine → User → Directory → Agent → Model.
 * Every picker is a closed set from what the machine registered; the browser
 * can never name a directory or agent the daemon did not offer.
 */
export default function NewSessionPage() {
  const router = useRouter();
  const user = useAuth();
  const polled = useHosts();
  const [hosts, setHosts] = useState<Host[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [hostId, setHostId] = useState("");
  const [cwd, setCwd] = useState("");
  const [dirQuery, setDirQuery] = useState("");
  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");
  // Never remembered: every visit starts with prompts ON (LSW-08).
  const [bypass, setBypass] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      setHosts(await listHosts());
    } catch (e) {
      setLoadErr(`Couldn't load your machines: ${(e as Error).message}`);
      setHosts((h) => h ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Pick up the shell's 20s poll too, so a daemon started meanwhile appears.
  useEffect(() => {
    if (polled) setHosts(polled);
  }, [polled]);

  const host = hosts?.find((h) => h.id === hostId);

  const pickHost = (h: Host) => {
    setHostId(h.id);
    setCwd(h.dirs[0] ?? "");
    const wanted = requestedAgent();
    const a = wanted && h.agents.includes(wanted) ? wanted : (h.agents[0] ?? "");
    setAgent(a);
    setModel(rememberedModel(h, a));
    setDirQuery("");
  };

  // Pre-select the machine when there is only one; drop a choice that vanished.
  useEffect(() => {
    if (!hosts) return;
    if (hostId && !hosts.some((h) => h.id === hostId)) setHostId("");
    if (!hostId && hosts.length === 1) pickHost(hosts[0]);
  }, [hosts, hostId]);

  const dirs = useMemo(() => {
    const q = dirQuery.trim().toLowerCase();
    return (host?.dirs ?? []).filter((d) => !q || d.toLowerCase().includes(q));
  }, [host, dirQuery]);

  const catalog = host ? modelsFor(host, agent) : null;
  const models = catalog?.models ?? [];
  const defaultModel = models.find((m) => m.id === catalog?.default_model);
  const picked = models.find((m) => m.id === model);
  const canStart = !!host && !!cwd && !!agent && !starting;

  const start = async () => {
    if (!host || !canStart) return;
    setStarting(true);
    setError(null);
    try {
      const created = await createSessionOnHost(
        host.id,
        agent,
        cwd,
        model || undefined,
        undefined,
        bypass,
        forkSource().id || undefined,
      );
      if (created.spawn?.status === "failed") {
        // Stay on the form so the reason is readable, rather than dropping the
        // user into a session with no agent behind it.
        setError(
          `The session was created, but the machine refused to start the agent: ${
            created.spawn.error ?? "unknown error"
          }. It is in the sidebar if you still want to open it.`,
        );
        setStarting(false);
        return;
      }
      router.push(`/session/${created.id}`);
    } catch (e) {
      setError(`Couldn't start the session: ${(e as Error).message}`);
      setStarting(false);
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Icon name="terminal" />
        <h1 className="t-headline">
          {forkSource().name
            ? `Continue “${forkSource().name}”`
            : forkSource().id
              ? "Continue session"
              : "New agent session"}
        </h1>
        <Button variant="prominent" onClick={start} disabled={!canStart} busy={starting}>
          {starting
            ? forkSource().id
              ? "Continuing…"
              : "Starting…"
            : forkSource().id
              ? "Continue session"
              : "Start session"}
        </Button>
      </header>
      {forkSource().id && (
        <p className={s.muted} style={{ padding: "0 var(--space-16)" }} role="status">
          Pick a connected machine and agent — this continues the session with its
          context, keeps its viewers, and names itself “fork-N”.
        </p>
      )}

      <div className={s.body}>
        {hosts === null ? (
          <p className={s.muted} role="status">
            Looking for your machines…
          </p>
        ) : hosts.length === 0 ? (
          <Card className={s.panel}>
            <h2 className="t-title">No machines are online</h2>
            <p className={s.muted}>
              A machine appears here once <code>live daemon</code> is running on it and
              registered to your account. Start the daemon from the directory you want
              agents to work in.
            </p>
            <ol className={s.steps}>
              <li>
                Install the CLI
                <InstallCommand command={INSTALL_CMD} />
              </li>
              <li>
                Sign in
                <InstallCommand command="live login" />
              </li>
              <li>
                Run the daemon, naming the directories agents may use
                <InstallCommand command="live daemon --dir ~/code" />
              </li>
            </ol>
            <div className={s.row}>
              <Button onClick={load}>Check again</Button>
              <Link href="/install">Install guide</Link>
              <Link href="/docs/web-sessions">How web sessions work</Link>
            </div>
          </Card>
        ) : (
          <>
            <Field label="Machine">
              <div className={s.grid} role="radiogroup" aria-label="Machine">
                {hosts.map((h) => {
                  const online = isOnline(h);
                  return (
                    <label
                      key={h.id}
                      className={`${s.option} ${h.id === hostId ? s.selected : ""}`}
                    >
                      <input
                        type="radio"
                        name="host"
                        checked={h.id === hostId}
                        onChange={() => pickHost(h)}
                      />
                      <span className={s.optMain}>
                        <span className={s.optTitle}>
                          <span className={`${s.dot} ${online ? s.dotOn : ""}`} aria-hidden />
                          {h.name}
                        </span>
                        <span className={s.meta}>
                          {h.os}/{h.arch}
                          {online ? " · online" : ` · offline · seen ${timeAgo(h.seen_at)}`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>

            {host && (
              <>
                <Field label="User">
                  <Card className={s.panel}>
                    <span>{osUser(host)}</span>
                    {user?.handle && (
                      <span className={s.meta}>Owned by @{user.handle}</span>
                    )}
                  </Card>
                </Field>

                <Field label="Directory">
                  {host.dirs.length > 5 && (
                    <input
                      className={s.search}
                      type="search"
                      placeholder="Filter directories"
                      aria-label="Filter directories"
                      value={dirQuery}
                      onChange={(e) => setDirQuery(e.target.value)}
                    />
                  )}
                  <div className={s.list} role="radiogroup" aria-label="Directory">
                    {dirs.map((d) => (
                      <label key={d} className={`${s.option} ${d === cwd ? s.selected : ""}`}>
                        <input
                          type="radio"
                          name="cwd"
                          checked={d === cwd}
                          onChange={() => setCwd(d)}
                        />
                        <span className={s.optMain}>
                          <span className={s.optTitle}>{repoName(d)}</span>
                          <span className={`${s.meta} ${s.mono}`}>{d}</span>
                        </span>
                      </label>
                    ))}
                    {dirs.length === 0 && <p className={s.muted}>No directory matches.</p>}
                  </div>
                </Field>

                <Field label="Agent">
                  <div className={s.grid} role="radiogroup" aria-label="Agent">
                    {host.agents.map((a) => {
                      const am = modelsFor(host, a);
                      const n = am.models.length;
                      const row = harnessRow(a);
                      return (
                        <label key={a} className={`${s.option} ${a === agent ? s.selected : ""}`}>
                          <input
                            type="radio"
                            name="agent"
                            checked={a === agent}
                            onChange={() => {
                              setAgent(a);
                              // A model from the previous agent means nothing here.
                              setModel(rememberedModel(host, a));
                            }}
                          />
                          <span className={s.optMain}>
                            <span className={s.optTitle}>{AGENT_NAMES[a] ?? a}</span>
                            <span className={s.chips}>
                              {am.model_switchable && <Chip>Live model switch</Chip>}
                              {n > 0 && (
                                <Chip>
                                  {n} model{n === 1 ? "" : "s"}
                                </Chip>
                              )}
                            </span>
                            <span
                              className={s.meta}
                              title={row.gaps !== "—" ? `Known gaps: ${row.gaps}` : undefined}
                            >
                              {row.summary}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>

                {agent && (
                  <Field label="Model">
                    <select
                      className={s.select}
                      aria-label="Model"
                      value={model}
                      disabled={models.length === 0}
                      onChange={(e) => {
                        setModel(e.target.value);
                        rememberModel(host.id, agent, e.target.value);
                      }}
                    >
                      <option value="">
                        {models.length === 0
                          ? "Uses the agent's default"
                          : defaultModel
                            ? `Default (${defaultModel.label || defaultModel.id})`
                            : "Default"}
                      </option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label || m.id}
                        </option>
                      ))}
                    </select>
                    {picked?.label && <span className={`${s.meta} ${s.mono}`}>{picked.id}</span>}
                  </Field>
                )}

                {!isOnline(host) && (
                  <p className={`${s.panel} ${s.warn}`} role="note">
                    This machine hasn&apos;t checked in recently. Starting a session may
                    produce one with no agent attached.
                  </p>
                )}

                <Card className={s.panel}>
                  <label className={s.toggle}>
                    <input
                      type="checkbox"
                      checked={bypass}
                      onChange={(e) => setBypass(e.target.checked)}
                    />
                    <span>Skip permission prompts</span>
                  </label>
                  {bypass ? (
                    <p className={`${s.warn} ${s.warnInline}`} role="alert">
                      The agent runs without asking before each tool call. Only for a
                      directory you trust it in.
                    </p>
                  ) : (
                    <span className={s.meta}>
                      {spawnAgentCaps(agent).approvals
                        ? "Off: you approve each tool call from the session page."
                        : "This agent can't ask for approval from the web — it uses its own terminal prompts, which nobody can answer for a web-started session. Turn this on, or start it from your terminal."}
                    </span>
                  )}
                </Card>
              </>
            )}

            <p className={s.meta}>
              Directories come from the daemon&apos;s own registration — this page can
              never name a path the machine has not allowed.
            </p>
          </>
        )}

        {(error || loadErr) && (
          <p className={`${s.panel} ${s.error}`} role="alert">
            {error ?? loadErr}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={s.field}>
      <h2 className={s.label}>{label}</h2>
      {children}
    </section>
  );
}
