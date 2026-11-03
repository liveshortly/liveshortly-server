"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { useHosts } from "@/components/HostsContext";
import { useSessions, byRecent } from "@/components/SessionsContext";
import ProfileMenu from "@/components/ProfileMenu";
import ShareSheet from "@/components/ShareSheet";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import Menu, { type MenuItem } from "@/components/ui/Menu";
import SessionMark from "@/components/ui/SessionMark";
import StatusBadge from "@/components/ui/StatusBadge";
import { deleteSession, renameSession, sessionTitle, sessionViewUrl, stopSession, type Session } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { repoName } from "@/lib/sessionList";
import { agentTitle, timeAgo } from "@/lib/utils";
import s from "./shell.module.css";

/** The sidebar shows the newest few of each kind; the rest live in the full
 *  lists (and ⌘K reaches any of them). Mac: SidebarView.recentLimit. */
const RECENT = 5;

type Confirm = { kind: "end" | "delete"; s: Session };

/**
 * Mac/Shell/SidebarView, on the web: search, New session, then LIVE,
 * SESSIONS, SHARED WITH ME, PROJECTS and MACHINES, and a footer with the
 * account, a daemon dot and Settings.
 */
export default function WorkspaceSidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const activeId = pathname.startsWith("/session/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : null;
  const user = useAuth();
  const hosts = useHosts();
  const { mine, shared, totals, patch, drop } = useSessions();

  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<Session | null>(null);

  const needle = q.trim().toLowerCase();
  const match = (x: Session) =>
    !needle ||
    sessionTitle(x).toLowerCase().includes(needle) ||
    x.tags?.some((t) => t.toLowerCase().includes(needle));

  const g = useMemo(() => {
    const m = [...(mine ?? [])].sort(byRecent);
    const projects = new Map<string, number>();
    for (const x of m) {
      const r = repoName(x.git_remote);
      if (r) projects.set(r, (projects.get(r) ?? 0) + 1);
    }
    return {
      total: Math.max(totals.mine, m.length),
      sharedTotal: Math.max(totals.shared, shared?.length ?? 0),
      live: m.filter((x) => x.status === "live" && match(x)),
      recent: m.filter((x) => x.status !== "live" && match(x)),
      shared: [...(shared ?? [])].sort(byRecent).filter(match),
      projects: [...projects].sort((a, b) => b[1] - a[1]).slice(0, RECENT),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, shared, needle]);

  const agents = [...new Set((hosts ?? []).flatMap((h) => h.agents))];

  const doConfirm = async () => {
    if (!confirm) return;
    const { kind, s: target } = confirm;
    setBusy(true);
    try {
      if (kind === "end") patch(await stopSession(target.id));
      else {
        await deleteSession(target.id);
        drop(target.id);
        if (activeId === target.id) router.push(ROUTES.sessions);
      }
      setError(null);
    } catch (e) {
      setError(`Couldn't ${kind} that session: ${(e as Error).message}`);
    }
    setBusy(false);
    setConfirm(null);
  };

  const rowProps = {
    activeId,
    onRenamed: patch,
    onConfirm: (c: Confirm) => setConfirm(c),
    onShare: (x: Session) => setShare(x),
  };

  return (
    <div className={s.sidebar}>
      <div className={s.sideTop}>
        <label className={s.search}>
          <Icon name="magnifyingglass" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            spellCheck={false}
            className="t-body"
          />
        </label>
        <div className={s.split}>
          <Link href={ROUTES.newSession} className={`${s.newBtn} t-headline`}>
            <Icon name="plus" size={14} />
            New session
          </Link>
          {agents.length > 0 && (
            <Menu
              label="New session with agent"
              icon="chevron.down"
              items={agents.map((a) => ({
                label: `New ${a.charAt(0).toUpperCase()}${a.slice(1)} session`,
                onSelect: () => router.push(`${ROUTES.newSession}?agent=${encodeURIComponent(a)}`),
              }))}
            />
          )}
        </div>
      </div>

      <nav aria-label="Sessions" className={s.sideScroll}>
        {mine == null ? (
          <p className={`${s.muted} t-callout`}>Loading sessions…</p>
        ) : (
          <>
            {g.live.length > 0 && (
              <Section label="Live" count={g.live.length}>
                {g.live.map((x) => (
                  <Row key={x.id} s={x} owner {...rowProps} />
                ))}
              </Section>
            )}

            <Section label="Sessions">
              {g.recent.slice(0, RECENT).map((x) => (
                <Row key={x.id} s={x} owner {...rowProps} />
              ))}
              {g.total === 0 ? (
                <p className={`${s.muted} t-callout`}>
                  No sessions yet. Run <code>live claude</code> to start one.
                </p>
              ) : needle && g.recent.length === 0 && g.live.length === 0 ? (
                <p className={`${s.muted} t-callout`}>No matches</p>
              ) : (
                <Link href={ROUTES.sessions} className={`${s.more} t-callout`}>
                  <Icon name="list.bullet" size={14} />
                  All sessions ({g.total})
                </Link>
              )}
            </Section>

            {g.shared.length > 0 && (
              <Section label="Shared with me">
                {g.shared.slice(0, RECENT).map((x) => (
                  <Row key={x.id} s={x} {...rowProps} />
                ))}
                <Link href={ROUTES.shared} className={`${s.more} t-callout`}>
                  <Icon name="list.bullet" size={14} />
                  All ({g.sharedTotal})
                </Link>
              </Section>
            )}

            {g.projects.length > 0 && (
              <Section label="Projects">
                {g.projects.map(([repo, n]) => (
                  <Link key={repo} href={ROUTES.project(repo)} className={`${s.plainRow} t-body`}>
                    <Icon name="folder" size={14} />
                    <span className={s.ellipsis}>{repo}</span>
                    <span className={`${s.meta} t-metric`}>{n}</span>
                  </Link>
                ))}
              </Section>
            )}

            {hosts && hosts.length > 0 && (
              <Section label="Machines">
                {hosts.map((h) => (
                  <Link key={h.id} href={ROUTES.newSession} className={`${s.plainRow} t-body`}>
                    <StatusBadge status="live" label="Online" />
                    <span className={s.ellipsis}>{h.name || h.hostname}</span>
                  </Link>
                ))}
              </Section>
            )}

            {error && (
              <p role="alert" className={`${s.error} t-callout`}>
                {error}
              </p>
            )}
          </>
        )}
      </nav>

      {user && (
        <div className={s.sideFoot}>
          <ProfileMenu user={user} direction="up" align="start">
            <span className={s.account}>
              <span className={`${s.ellipsis} t-callout`}>
                {user.handle ? `@${user.handle}` : (user.name ?? user.email ?? "Account")}
              </span>
            </span>
          </ProfileMenu>
          {hosts && hosts.length > 0 && (
            <span
              className={s.daemonDot}
              role="img"
              aria-label={`${hosts.length} machine${hosts.length === 1 ? "" : "s"} online`}
              title={`${hosts.length} machine${hosts.length === 1 ? "" : "s"} online`}
            />
          )}
          <Link href="/settings" className={s.gear} aria-label="Settings" title="Settings">
            <Icon name="gearshape" />
          </Link>
        </div>
      )}

      <Dialog
        open={!!confirm}
        onClose={() => !busy && setConfirm(null)}
        title={
          confirm
            ? `${confirm.kind === "end" ? "End" : "Delete"} “${sessionTitle(confirm.s)}”?`
            : ""
        }
      >
        <p className="t-body" style={{ margin: 0 }}>
          {confirm?.kind === "end" ? "The agent stops where it is." : "This cannot be undone."}
        </p>
        <div className={s.dialogActions}>
          <Button onClick={() => setConfirm(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" busy={busy} onClick={doConfirm}>
            {confirm?.kind === "end" ? "End session" : "Delete session"}
          </Button>
        </div>
      </Dialog>

      <ShareSheet session={share} owner onChanged={patch} onClose={() => setShare(null)} />
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className={s.section}>
      <h2 className={`${s.sectionLabel} t-caption`}>
        {label}
        {count != null && (
          <span className={`${s.count} t-metric`} aria-label={`${count} live`}>
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** Mac SessionRow (SidebarView.swift): mark, title, last-event snippet, and a
 *  context menu (also on right-click). */
function Row({
  s: x,
  owner,
  activeId,
  onRenamed,
  onConfirm,
  onShare,
}: {
  s: Session;
  owner?: boolean;
  activeId: string | null;
  onRenamed: (u: Session) => void;
  onConfirm: (c: Confirm) => void;
  onShare: (x: Session) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(x.title);
  const live = x.status === "live";
  const title = sessionTitle(x);
  // Unread from the server's per-account read marks (LSW-32); never on the
  // row being viewed (useMarkSeen clears it).
  const unread = x.id === activeId ? 0 : (x.unread ?? 0);
  // ponytail: no per-event type in the list API, so the snippet is the
  // precomputed hero line without the Mac's ◆/› prefix.
  const sub = x.hero || (owner ? `${agentTitle(x.framework)} · ${live ? "live" : `${timeAgo(x.ended_at ?? x.created_at)} ago`}` : `@${x.owner_handle}`);

  const save = async () => {
    const t = draft.trim();
    setEditing(false);
    if (!t || t === x.title) return;
    try {
      await renameSession(x.id, t);
      onRenamed({ ...x, title: t, suggested_title: null });
    } catch {
      /* the name simply won't change */
    }
  };

  const items: MenuItem[] = [
    { label: "Open", onSelect: () => router.push(ROUTES.session(x.id)) },
    { label: "Open in new tab", onSelect: () => window.open(ROUTES.session(x.id), "_blank", "noopener") },
    { label: "Copy link", onSelect: () => void navigator.clipboard?.writeText(sessionViewUrl(x.id)) },
    ...(owner
      ? [
          { label: "Share…", onSelect: () => onShare(x) },
          {
            label: "Rename…",
            onSelect: () => {
              setDraft(x.title);
              setEditing(true);
            },
          },
          ...(live ? [{ label: "End session", destructive: true, onSelect: () => onConfirm({ kind: "end", s: x }) }] : []),
          { label: "Delete", destructive: true, onSelect: () => onConfirm({ kind: "delete", s: x }) },
        ]
      : []),
  ];

  return (
    <div
      ref={ref}
      className={s.row}
      data-active={x.id === activeId || undefined}
      onContextMenu={(e) => {
        const trigger = ref.current?.querySelector<HTMLButtonElement>("[aria-haspopup=menu]");
        if (!trigger || editing) return;
        e.preventDefault();
        trigger.click();
      }}
    >
      {editing ? (
        <span className={s.rowLink}>
          <SessionMark live={live} />
          <input
            autoFocus
            aria-label="Session name"
            className={`${s.rename} t-body`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        </span>
      ) : (
        <Link
          href={ROUTES.session(x.id)}
          className={s.rowLink}
          aria-current={x.id === activeId ? "page" : undefined}
        >
          <SessionMark live={live} />
          <span className={s.rowText}>
            <span className={`${s.ellipsis} t-body`}>{title}</span>
            <span className={`${s.ellipsis} ${s.meta} t-callout`}>{sub}</span>
          </span>
          {unread > 0 && (
            <span className={`${s.count} ${s.unread} t-metric`} aria-label={`${unread} unread`}>
              {unread}
            </span>
          )}
        </Link>
      )}
      <span className={s.rowMenu}>
        <Menu label={`Actions for ${title}`} icon="ellipsis" items={items} />
      </span>
    </div>
  );
}
