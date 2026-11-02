"use client";

import { useMemo, useRef, useState } from "react";
import type { Session, SessionDetail, SessionEvent } from "@/lib/api";
import { fmtInt, frameworkLabel } from "@/lib/utils";
import HandoffButton from "@/components/HandoffButton";
import PublicLinkDialog from "@/components/PublicLinkDialog";
import PublishAction from "@/components/PublishAction";
import ShareToTwitter from "@/components/ShareToTwitter";
import Button, { IconButton } from "@/components/ui/Button";
import s from "./session.module.css";

/** Optional right panel (⌘I): session info, watchers, forks, files touched,
 *  and the existing share / fork / publish controls (LSW-07 replaces those). */
export default function InfoPanel({
  meta,
  events,
  onMeta,
  onClose,
}: {
  meta: SessionDetail;
  events: SessionEvent[];
  onMeta: (u: Session) => void;
  onClose: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const linkRef = useRef<HTMLSpanElement>(null);

  // Files touched, from the work runs (newest first).
  const files = useMemo(() => {
    const seen = new Set<string>();
    for (let i = events.length - 1; i >= 0; i--) {
      const p = events[i].payload ?? {};
      const input = (p.input ?? {}) as Record<string, unknown>;
      const f =
        events[i].event_type === "file_write"
          ? (p.file ?? p.file_path ?? p.path)
          : events[i].event_type === "tool_call" &&
              ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(String(p.tool))
            ? input.file_path
            : undefined;
      if (typeof f === "string" && f) seen.add(f);
    }
    return [...seen].slice(0, 30);
  }, [events]);

  const rows: [string, string][] = [
    ["Agent", frameworkLabel(meta.framework)],
    ["Model", meta.model ?? "—"],
    ...(meta.client_handle ? ([["Captured by", meta.client_handle]] as [string, string][]) : []),
    ["Views", fmtInt(meta.view_count ?? 0)],
    ...(meta.status === "live"
      ? ([["Watching", fmtInt(meta.watcher_count ?? 0)]] as [string, string][])
      : []),
    ["Forks", fmtInt(meta.fork_count ?? 0)],
    ...(meta.git_remote
      ? ([["Git", `${meta.git_remote.replace(/^.*[/:]([^/]+\/[^/]+?)(?:\.git)?$/, "$1")}${meta.git_branch ? ` @ ${meta.git_branch}` : ""}`]] as [string, string][])
      : []),
  ];

  return (
    <aside className={s.info} aria-label="Session info">
      <div className={s.infoHead}>
        <span className="t-caption">Session info</span>
        <IconButton icon="xmark" label="Close session info" onClick={onClose} />
      </div>
      <dl className={s.infoList}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="t-caption">{k}</dt>
            <dd className="t-callout" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {meta.tags?.length > 0 && <p className={`${s.muted} t-callout`}>#{meta.tags.join("  #")}</p>}

      {files.length > 0 && (
        <>
          <span className="t-caption">Files touched</span>
          <ul className={s.files}>
            {files.map((f) => (
              <li key={f} className="t-mono" title={meta.is_owner ? f : undefined}>
                {f.split("/").pop()}
              </li>
            ))}
          </ul>
        </>
      )}

      <span className="t-caption">Actions</span>
      <div className={s.infoActions}>
        <HandoffButton sessionId={meta.id} fullWidth />
        <ShareToTwitter session={meta} onChanged={onMeta} />
        {meta.is_owner && <PublishAction session={meta} onChanged={onMeta} />}
        {meta.is_owner && (
          <span ref={linkRef}>
            <Button onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen}>
              Share link…
            </Button>
          </span>
        )}
        {linkOpen && (
          <PublicLinkDialog
            sessionId={meta.id}
            title={meta.title}
            visibility={meta.visibility ?? "private"}
            anchorEl={linkRef.current}
            onClose={() => setLinkOpen(false)}
            onChanged={onMeta}
          />
        )}
      </div>
    </aside>
  );
}
