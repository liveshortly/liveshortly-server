"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CLAUDE_MODELS,
  deleteSession,
  isPublished,
  postBypass,
  renameSession,
  sessionViewUrl,
  setSessionModel,
  stopSession,
  type ClaudeModel,
  type SessionDetail,
} from "@/lib/api";
import { agentCaps, fmtInt, timeAgo } from "@/lib/utils";
import ShareSheet from "@/components/ShareSheet";
import { SIDEBAR_ID, useWorkspaceDrawer } from "@/components/WorkspaceDrawerContext";
import Button, { IconButton } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Menu, { type MenuItem } from "@/components/ui/Menu";
import Icon from "@/components/ui/Icon";
import SessionMark from "@/components/ui/SessionMark";
import StatusBadge from "@/components/ui/StatusBadge";
import s from "./session.module.css";

/** Status strip (Mac LSChatView.statusStrip) + a muted meta line. */
export default function StatusStrip({
  meta,
  eventTotal,
  busy,
  activity,
  onMeta,
  onDeleted,
  onToggleInfo,
}: {
  meta: SessionDetail;
  eventTotal: number;
  busy: boolean;
  activity: string;
  onMeta: (u: Partial<SessionDetail>) => void;
  onDeleted: () => void;
  onToggleInfo: () => void;
}) {
  const drawer = useWorkspaceDrawer();
  const live = meta.status === "live";
  const owner = meta.is_owner === true;
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<"end" | "delete" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [canAskNotify, setCanAskNotify] = useState(false);
  const title = meta.suggested_title?.trim() || meta.title?.trim() || "Untitled session";

  // ⌘⇧S / Ctrl+Shift+S opens the share sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShareOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setCanAskNotify("Notification" in window && Notification.permission === "default");
  }, []);

  const runConfirmed = async () => {
    setBusyAction(true);
    setActionErr(null);
    try {
      if (confirm === "end") {
        await stopSession(meta.id);
        onMeta({ status: "ended", ended_at: new Date().toISOString() });
      } else {
        await deleteSession(meta.id);
        onDeleted();
      }
      setConfirm(null);
    } catch {
      setActionErr(`Couldn't ${confirm} this session — try again.`);
    } finally {
      setBusyAction(false);
    }
  };

  const items: MenuItem[] = [
    ...(owner ? [{ label: "Rename…", onSelect: () => setRenaming(true) }] : []),
    {
      label: "Copy link",
      onSelect: () => void navigator.clipboard?.writeText(sessionViewUrl(meta.id)).catch(() => {}),
    },
    { label: "Share… (⌘⇧S)", onSelect: () => setShareOpen(true) },
    { label: "Session info (⌘I)", onSelect: onToggleInfo },
    ...(owner && live && canAskNotify
      ? [
          {
            label: "Notify me when this agent needs approval",
            onSelect: () =>
              void Notification.requestPermission().then(() => setCanAskNotify(false)),
          },
        ]
      : []),
    ...(owner && live
      ? [
          {
            label: meta.bypass_all
              ? "Stop skipping permissions"
              : "Skip all permissions",
            onSelect: async () => {
              const next = !meta.bypass_all;
              onMeta({ bypass_all: next }); // optimistic
              try {
                await postBypass(meta.id, next);
              } catch {
                onMeta({ bypass_all: !next }); // revert on failure
              }
            },
          },
        ]
      : []),
    ...(owner && live
      ? [{ label: "End session", onSelect: () => setConfirm("end"), destructive: true }]
      : []),
    ...(owner
      ? [{ label: "Delete session", onSelect: () => setConfirm("delete"), destructive: true }]
      : []),
  ];

  const visibility = meta.visibility ?? "private";
  const machine = meta.client_handle?.split("@").pop();

  return (
    <header className={s.strip}>
      <div className={s.stripRow}>
        {drawer ? (
          <IconButton
            icon="line.3.horizontal"
            label="Session history"
            className={s.mobileOnly}
            onClick={() => drawer.toggle()}
            aria-expanded={drawer.open}
            aria-controls={SIDEBAR_ID}
          />
        ) : (
          <Link href="/" className={`${s.mobileOnly} ${s.back}`} aria-label="Back">
            ‹
          </Link>
        )}
        {renaming ? (
          <RenameField meta={meta} onDone={(t) => (t && onMeta({ title: t, suggested_title: null }), setRenaming(false))} />
        ) : owner ? (
          <button
            type="button"
            className={`${s.title} ${s.titleBtn} t-headline`}
            onClick={() => setRenaming(true)}
            title="Rename this session"
            aria-label={`Session title, ${title}. Rename`}
          >
            {title}
          </button>
        ) : (
          <h1 className={`${s.title} t-headline`}>{title}</h1>
        )}

        {live ? (
          <StatusBadge status="live" />
        ) : (
          <StatusBadge
            status="ended"
            label={meta.ended_reason === "quota" ? "Ended · quota" : undefined}
            title={meta.ended_reason === "quota" ? "Auto-ended — owner reached their storage quota" : undefined}
          />
        )}
        {live && busy && (
          <span className={`${s.activity} t-callout`} aria-label={`Agent is ${activity}`}>
            <SessionMark live size={14} />
            <span aria-hidden>{activity}</span>
          </span>
        )}
        {live && (meta.watcher_count ?? 0) > 0 && (
          <span className={`${s.muted} t-caption ${s.wideOnly}`}>
            {fmtInt(meta.watcher_count)} watching
          </span>
        )}
        {live && meta.bypass_all && (
          <span
            className={`${s.bypassBadge} t-caption`}
            title="All tool permissions are auto-approved for this session — permission gating is OFF"
          >
            Permissions skipped
            <Icon name="exclamationmark.triangle" size={11} />
          </span>
        )}
        <span className={s.wideOnly}>
          <StatusBadge
            status={visibility === "open" ? "link" : visibility}
            label={visibility === "open" ? "Open link" : undefined}
            title={visibility === "open" ? "Anyone with the link can watch — no sign-in" : undefined}
          />
        </span>
        {isPublished(meta) && (
          <span className={s.wideOnly}>
            <StatusBadge status="feed" />
          </span>
        )}

        <span className={s.spacer} />

        {owner && live && agentCaps(meta.framework).modelSwitch ? (
          <ModelSwitcher id={meta.id} current={meta.model ?? ""} onMeta={onMeta} />
        ) : (
          meta.model && <span className={`${s.chip} ${s.wideOnly} t-caption`}>{meta.model}</span>
        )}
        <span className={s.wideOnly}>
          <Button onClick={() => setShareOpen(true)} aria-haspopup="dialog">
            Share
          </Button>
        </span>
        <ShareSheet
          session={shareOpen ? meta : null}
          owner={owner}
          onChanged={onMeta}
          onClose={() => setShareOpen(false)}
        />
        <Menu label="Session actions" icon="ellipsis" items={items} />
      </div>

      <div className={`${s.metaLine} t-callout`}>
        <span>@{meta.owner_handle}</span>
        {machine && <span>· {machine}</span>}
        <span suppressHydrationWarning>
          · {live ? `started ${timeAgo(meta.created_at)}` : `ended ${timeAgo(meta.ended_at)}`}
        </span>
        <span>
          · {fmtInt(eventTotal)} event{eventTotal === 1 ? "" : "s"}
        </span>
        {meta.forked_from && (
          <Link href={`/session/${meta.forked_from.id}`} className={s.metaLink}>
            · forked from @{meta.forked_from.owner_handle}
          </Link>
        )}
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => (setConfirm(null), setActionErr(null))}
        title={confirm === "end" ? "End this session?" : "Delete this session?"}
      >
        <p className="t-body">
          {confirm === "end"
            ? "The agent stops where it is."
            : "Delete this session permanently? This cannot be undone."}
        </p>
        {actionErr && (
          <p className={`${s.errText} t-callout`} role="alert">
            {actionErr}
          </p>
        )}
        <div className={s.reviewActions}>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="destructive" busy={busyAction} onClick={runConfirmed}>
            {confirm === "end" ? "End session" : "Delete session"}
          </Button>
        </div>
      </Dialog>
    </header>
  );
}

function RenameField({
  meta,
  onDone,
}: {
  meta: SessionDetail;
  onDone: (title: string | null) => void;
}) {
  const [draft, setDraft] = useState(meta.title);
  const [err, setErr] = useState(false);
  const save = async () => {
    const t = draft.trim();
    if (!t || t === meta.title) return onDone(null);
    try {
      await renameSession(meta.id, t);
      onDone(t);
    } catch {
      setErr(true);
    }
  };
  return (
    <>
    <input
      autoFocus
      className={`${s.renameField} t-headline`}
      value={draft}
      maxLength={200}
      aria-label="Session name"
      aria-invalid={err || undefined}
      title={err ? "Couldn't rename — press Enter to retry" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        else if (e.key === "Escape") onDone(null);
      }}
    />
    {err && (
      <span role="alert" className="sr-only">
        Couldn&apos;t rename. Press Enter to retry.
      </span>
    )}
    </>
  );
}

/** Live model switch (owner, claude): the daemon types `/model <alias>`. */
function ModelSwitcher({
  id,
  current,
  onMeta,
}: {
  id: string;
  current: string;
  onMeta: (u: Partial<SessionDetail>) => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const value = CLAUDE_MODELS.find((m) => current.toLowerCase().includes(m)) ?? "";
  const change = async (next: string) => {
    if (!next) return;
    setState("busy");
    try {
      await setSessionModel(id, next as ClaudeModel);
      onMeta({ model: next });
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return (
    <select
      className={`${s.chip} ${s.modelSelect} t-caption`}
      value={value}
      disabled={state === "busy"}
      onChange={(e) => change(e.target.value)}
      aria-label="Agent model — switch the agent's model"
      aria-invalid={state === "error" || undefined}
      title={state === "error" ? "Couldn't switch the model" : "Switch the agent's model"}
    >
      {!value && <option value="">{current || "model"}</option>}
      {CLAUDE_MODELS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
