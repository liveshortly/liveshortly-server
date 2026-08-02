"use client";

import { useHosts } from "@/components/HostsContext";

/**
 * Always-visible daemon connectivity pill in Topbar — unlike NewSessionButton
 * (which renders nothing when offline, since there's nothing to start), this
 * stays present through the whole authenticated app so "is my machine
 * reachable" is answerable at a glance, on every page, without opening the
 * new-session panel.
 */
export default function DaemonStatus() {
  const hosts = useHosts();
  const online = (hosts?.length ?? 0) > 0;

  const label =
    hosts === null ? "daemon: …" : online ? "daemon: connected" : "daemon: offline";
  const title =
    hosts === null
      ? "Checking for machines running `live daemon`…"
      : online
        ? `${hosts.length} machine${hosts.length === 1 ? "" : "s"} connected`
        : "No machine is running `live daemon`";

  return (
    <span className={`daemon-status${online ? " on" : ""}`} title={title}>
      <span className="daemon-status-dot" aria-hidden />
      {label}
    </span>
  );
}
