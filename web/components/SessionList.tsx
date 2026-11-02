"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SessionCard from "@/components/SessionCard";
import ShareSheet, { BulkShareSheet } from "@/components/ShareSheet";
import Button, { IconButton } from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import Menu, { type MenuItem } from "@/components/ui/Menu";
import SessionMark from "@/components/ui/SessionMark";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import ui from "@/components/ui/ui.module.css";
import {
  createShare,
  deleteSession,
  isPublished,
  listSessions,
  publishSession,
  renameSession,
  sessionTitle,
  type Session,
  type ShareRole,
} from "@/lib/api";
import { groupByDate, machineName, repoName, runBulk } from "@/lib/sessionList";
import { frameworkLabel, timeAgo } from "@/lib/utils";
import s from "./SessionList.module.css";

const POLL_MS = 5000;
const VIEW_KEY = "ls.sessions.view";
/** API page size (its max); "Load more" adds pages. */
const PAGE = 100;

/** A list row: the API session plus the list-only enrichments. */
export type Row = Session & {
  shared: boolean;
  agent?: string | null;
  last_event?: { type: string; snippet: string; ts: string };
};

type Owner = "mine" | "shared" | null;
type Filters = { live: boolean; published: boolean; owner: Owner; agent: string; machine: string; repo: string };
const NO_FILTERS: Filters = { live: false, published: false, owner: null, agent: "", machine: "", repo: "" };

type Kind = "publish" | "share" | "delete";
const PAST: Record<Kind, string> = {
  publish: "published",
  share: "shared",
  delete: "deleted",
};
type Report = { kind: Kind; total: number; failed: Row[]; retry: () => void };

export const displayTitle = sessionTitle;
/** Server-side read marks (LSW-32): events since this account last opened it. */
const unread = (r: Row) => r.unread ?? 0;
const agentOf = (r: Row) => frameworkLabel(r.agent ?? r.framework);
const activity = (r: Row) => (r.status === "live" ? Date.now() : +new Date(r.last_event?.ts ?? r.ended_at ?? r.created_at));

function subtitle(r: Row): string {
  const bits = [agentOf(r), machineName(r.client_handle)];
  if (r.shared) bits.push(`@${r.owner_handle}`);
  bits.push(r.status === "live" ? `started ${timeAgo(r.created_at)}` : `ended ${timeAgo(r.ended_at ?? r.created_at)}`);
  return bits.filter((b) => b && b !== "—").join(" · ");
}

function badge(r: Row) {
  return <StatusBadge status={r.status === "live" ? "live" : r.shared ? "shared" : isPublished(r) ? "feed" : "ended"} />;
}

/**
 * The one session list (LSW-09) behind Sessions home, All sessions and Shared
 * with me: filter chips, date groups, list/grid, bulk actions that report
 * every failure, prompt-derived titles with inline rename.
 */
export default function SessionList({ home }: { home?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row[] | null>(null);
  const [bulkShare, setBulkShare] = useState<Row[] | null>(null);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  // ponytail: the poll refetches every loaded page (offset paging, newest
  // first); fine for hundreds of sessions, add a since-cursor if it's thousands.
  const load = useCallback(async () => {
    const scope = async (sc: "mine" | "shared") => {
      const res = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          listSessions({ scope: sc, status: "all", limit: PAGE, offset: i * PAGE }),
        ),
      );
      // A session created mid-fetch shifts offsets; keep each id once.
      const byId = new Map(res.flatMap((p) => p.results as Row[]).map((r) => [r.id, r]));
      return { rows: [...byId.values()].map((r) => ({ ...r, shared: sc === "shared" })), more: res[0].total > pages * PAGE };
    };
    try {
      const [m, sh] = await Promise.all([scope("mine"), scope("shared")]);
      setRows([...m.rows, ...sh.rows]);
      setMore(m.more || sh.more);
      setErr(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(true);
    }
  }, [pages]);

  // No list SSE exists: poll while the tab is visible, refetch on focus.
  useEffect(() => {
    load();
    try {
      if (localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
    } catch {}
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  // Deep links (lib/routes.ts): ?filter=live|shared|mine|published, ?project=acme/app.
  const params = useSearchParams();
  useEffect(() => {
    const f = params.get("filter");
    setFilters({
      ...NO_FILTERS,
      live: f === "live",
      published: f === "published",
      owner: f === "mine" || f === "shared" ? f : null,
      agent: params.get("agent") ?? "",
      machine: params.get("machine") ?? "",
      repo: params.get("project") ?? "",
    });
  }, [params]);

  const pickView = (v: "list" | "grid") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const options = useMemo(() => {
    const uniq = (f: (r: Row) => string) =>
      [...new Set((rows ?? []).map(f).filter((v) => v && v !== "—"))].sort();
    return {
      agent: uniq(agentOf),
      machine: uniq((r) => machineName(r.client_handle)),
      repo: uniq((r) => repoName(r.git_remote)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = filters;
    return (rows ?? [])
      .filter(
        (r) =>
          (!f.live || r.status === "live") &&
          (!f.published || isPublished(r)) &&
          (f.owner !== "mine" || !r.shared) &&
          (f.owner !== "shared" || r.shared) &&
          (!f.agent || agentOf(r) === f.agent) &&
          (!f.machine || machineName(r.client_handle) === f.machine) &&
          (!f.repo || repoName(r.git_remote) === f.repo) &&
          (!q ||
            [displayTitle(r), r.title, r.owner_handle, agentOf(r), r.client_handle, r.git_remote, ...r.tags]
              .some((v) => v?.toLowerCase().includes(q))),
      )
      .sort((a, b) => activity(b) - activity(a));
  }, [rows, filters, query]);

  const groups = useMemo(() => groupByDate(filtered, activity), [filtered]);

  const continueRows = useMemo(
    () =>
      home
        ? (rows ?? [])
            .filter((r) => !r.shared && (r.status === "live" || Date.now() - activity(r) < 86_400_000))
            .sort((a, b) => activity(b) - activity(a))
            .slice(0, 3)
        : [],
    [rows, home],
  );

  const ownedSelected = () => (rows ?? []).filter((r) => !r.shared && selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  /** Runs one action over targets; every failure is reported with a Retry. */
  const run = async (kind: Kind, targets: Row[], share?: { email: string; role: ShareRole }) => {
    if (targets.length === 0) return;
    const fn = {
      publish: (r: Row) => publishSession(r.id),
      delete: (r: Row) => deleteSession(r.id),
      share: (r: Row) => createShare(r.id, share!.email, share!.role),
    }[kind];
    setBusy(true);
    const failed = await runBulk(targets, fn);
    setBusy(false);
    setReport(
      failed.length ? { kind, total: targets.length, failed, retry: () => run(kind, failed, share) } : null,
    );
    // In bulk mode the failed items stay selected, so Retry/next action hits exactly them.
    if (selecting) {
      if (failed.length) setSelected(new Set(failed.map((r) => r.id)));
      else stopSelecting();
    }
    await load();
  };

  const loaded = rows !== null;
  const hasFilters = query.trim() !== "" || JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const heading = filters.owner === "shared" ? "Shared with me" : filters.repo || "All sessions";

  return (
    <div className={s.page}>
      {continueRows.length > 0 && !hasFilters && (
        <section aria-labelledby="continue-h" className={s.continue}>
          <h2 id="continue-h" className={`t-caption ${s.eyebrow}`}>
            Continue
          </h2>
          <div className={s.continueGrid}>
            {continueRows.map((r) => (
              <Link key={r.id} href={`/session/${r.id}`} className={s.continueCard}>
                <SessionMark live={r.status === "live"} size={28} />
                <span className={s.rowText}>
                  <span className={`t-headline ${s.title}`}>{displayTitle(r)}</span>
                  <span className={`t-callout ${s.sub}`}>{r.last_event?.snippet || subtitle(r)}</span>
                </span>
                {unread(r) > 0 && <Chip filled title="New events since you last opened it">{unread(r)}</Chip>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <header className={s.head}>
        <h1 className="t-title">{heading}</h1>
        {loaded && <Chip>{filtered.length}</Chip>}
        <span className={s.spacer} />
        <Input
          type="search"
          className={s.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions"
          aria-label="Search sessions"
        />
        <span className={s.viewToggle} role="group" aria-label="View">
          <IconButton
            icon="list.bullet"
            label="List view"
            aria-pressed={view === "list"}
            onClick={() => pickView("list")}
          />
          <IconButton
            icon="square.grid.2x2"
            label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => pickView("grid")}
          />
        </span>
        <Button aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
          {selecting ? "Done" : "Select"}
        </Button>
        <Link href="/new" className={`${ui.btn} ${ui.prominent}`}>
          New session
        </Link>
      </header>

      <div className={s.filters} role="group" aria-label="Filters">
        <FilterChip on={filters.live} onClick={() => setFilters({ ...filters, live: !filters.live })}>
          Live
        </FilterChip>
        <FilterChip
          on={filters.owner === "mine"}
          onClick={() => setFilters({ ...filters, owner: filters.owner === "mine" ? null : "mine" })}
        >
          Mine
        </FilterChip>
        <FilterChip
          on={filters.owner === "shared"}
          onClick={() => setFilters({ ...filters, owner: filters.owner === "shared" ? null : "shared" })}
        >
          Shared with me
        </FilterChip>
        <FilterChip on={filters.published} onClick={() => setFilters({ ...filters, published: !filters.published })}>
          Published
        </FilterChip>
        {(["agent", "machine", "repo"] as const).map(
          (k) =>
            options[k].length > 0 && (
              <select
                key={k}
                className={`t-callout ${s.chip} ${filters[k] ? s.chipOn : ""}`}
                aria-label={k === "repo" ? "Project" : k[0].toUpperCase() + k.slice(1)}
                value={filters[k]}
                onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
              >
                <option value="">{k === "agent" ? "Any agent" : k === "machine" ? "Any machine" : "Any project"}</option>
                {options[k].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ),
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(NO_FILTERS);
              setQuery("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {err && loaded && (
        <div className={`t-callout ${s.alert}`} role="alert">
          Couldn&apos;t refresh sessions — showing the last list.
          <Button variant="ghost" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {!loaded ? (
        err ? (
          <EmptyState icon="exclamationmark.triangle" title="Couldn't load sessions" onRetry={load}>
            Check your connection and try again.
          </EmptyState>
        ) : (
          <ul className={s.list} aria-label="Loading sessions">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className={s.row}>
                <Skeleton width={22} height={22} radius={7} />
                <span className={s.rowText}>
                  <Skeleton width="40%" height={13} />
                  <Skeleton width="65%" height={10} />
                </span>
                <Skeleton width={52} height={18} radius={9} />
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 ? (
        <EmptyState icon="terminal" title="No sessions yet">
          Run <code className="t-mono">live claude</code> in a terminal, or{" "}
          <Link href="/new">start a new session</Link> on one of your machines.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="magnifyingglass" title="No sessions match">
          Try another search or clear the filters.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className={`t-caption ${s.groupHead}`}>{g.label}</h2>
            {view === "list" ? (
              <ul className={s.list}>
                {g.rows.map((r) => (
                  <ListRow
                    key={r.id}
                    r={r}
                    unread={unread(r)}
                    selecting={selecting}
                    selected={selected.has(r.id)}
                    onToggle={toggle}
                    renaming={renamingId === r.id}
                    onRenameDone={(changed) => {
                      setRenamingId(null);
                      if (changed) load();
                    }}
                    menu={rowMenu(r, true)}
                  />
                ))}
              </ul>
            ) : (
              <div className={s.grid}>
                {g.rows.map((r) => (
                  <SessionCard
                    key={r.id}
                    session={{ ...r, title: displayTitle(r) }}
                    accessRole={r.shared ? (r.shared_role ?? "viewer") : null}
                    actions={
                      r.shared ? undefined : (
                        <>
                          {selecting && (
                            <input
                              type="checkbox"
                              className={s.check}
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                              aria-label={`Select ${displayTitle(r)}`}
                            />
                          )}
                          <span className={s.spacer} />
                          {unread(r) > 0 && <Chip filled>{unread(r)}</Chip>}
                          {rowMenu(r, false)}
                        </>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {loaded && more && (
        <div className={s.loadMore}>
          <Button onClick={() => setPages((n) => n + 1)}>Load more</Button>
        </div>
      )}

      {report && (
        <div className={`t-callout ${s.report}`} role="alert">
          <span>
            {report.total === 1
              ? `“${displayTitle(report.failed[0])}” couldn't be ${PAST[report.kind]}`
              : `${report.failed.length} of ${report.total} couldn't be ${PAST[report.kind]}: ${report.failed
                  .map(displayTitle)
                  .join(", ")}`}
          </span>
          <Button variant="ghost" busy={busy} onClick={report.retry}>
            Retry
          </Button>
          <IconButton icon="xmark" label="Dismiss" onClick={() => setReport(null)} />
        </div>
      )}

      {selecting && (
        <div className={s.bulkBar} role="region" aria-label="Bulk actions">
          <span className="t-headline">{ownedSelected().length} selected</span>
          <Button
            variant="ghost"
            onClick={() => setSelected(new Set(filtered.filter((r) => !r.shared).map((r) => r.id)))}
          >
            Select all
          </Button>
          <span className={s.spacer} />
          <Button
            busy={busy}
            disabled={ownedSelected().length === 0}
            onClick={() => run("publish", ownedSelected().filter((r) => !isPublished(r)))}
          >
            Publish
          </Button>
          <Button disabled={busy || ownedSelected().length === 0} onClick={() => setBulkShare(ownedSelected())}>
            Share
          </Button>
          <Button
            variant="destructive"
            disabled={busy || ownedSelected().length === 0}
            onClick={() => setConfirmDelete(ownedSelected())}
          >
            Delete
          </Button>
        </div>
      )}

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={
          confirmDelete?.length === 1
            ? `Delete “${displayTitle(confirmDelete[0])}”?`
            : `Delete ${confirmDelete?.length ?? 0} sessions?`
        }
      >
        <p className="t-body">This wipes their events, replay and archive. It can&apos;t be undone.</p>
        <div className={s.dialogActions}>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const targets = confirmDelete ?? [];
              setConfirmDelete(null);
              run("delete", targets);
            }}
          >
            Delete forever
          </Button>
        </div>
      </Dialog>

      <BulkShareSheet
        count={bulkShare?.length ?? null}
        onClose={() => setBulkShare(null)}
        onInvite={(email, role) => {
          const targets = bulkShare ?? [];
          setBulkShare(null);
          run("share", targets, { email, role });
        }}
      />

      <ShareSheet
        session={rows?.find((r) => r.id === sharingId) ?? null}
        owner
        onChanged={() => load()}
        onClose={() => setSharingId(null)}
      />
    </div>
  );

  /** Owner row actions; Rename is inline, so list view only. */
  function rowMenu(r: Row, canRename: boolean) {
    if (r.shared) return null;
    const items: MenuItem[] = [
      ...(canRename ? [{ label: "Rename", onSelect: () => setRenamingId(r.id) }] : []),
      { label: "Share…", onSelect: () => setSharingId(r.id) },
      { label: "Delete…", destructive: true, onSelect: () => setConfirmDelete([r]) },
    ];
    return <Menu label={`Actions for ${displayTitle(r)}`} icon="ellipsis" items={items} />;
  }
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} className={`t-callout ${s.chip} ${on ? s.chipOn : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ListRow({
  r,
  unread,
  selecting,
  selected,
  onToggle,
  renaming,
  onRenameDone,
  menu,
}: {
  r: Row;
  unread: number;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  renaming: boolean;
  onRenameDone: (changed: boolean) => void;
  menu: React.ReactNode;
}) {
  const [renameErr, setRenameErr] = useState(false);
  const saving = useRef(false);
  const cancelled = useRef(false); // Escape unmounts the field; its blur must not save

  const save = async (value: string) => {
    const t = value.trim();
    if (!t || t === displayTitle(r)) return onRenameDone(false);
    if (saving.current || cancelled.current) return;
    saving.current = true;
    try {
      await renameSession(r.id, t);
      setRenameErr(false);
      onRenameDone(true);
    } catch {
      setRenameErr(true); // stay in the field so the edit isn't lost
    } finally {
      saving.current = false;
    }
  };

  const body = (
    <>
      <SessionMark live={r.status === "live"} />
      <span className={s.rowText}>
        {renaming ? (
          <input
            autoFocus
            onFocus={() => (cancelled.current = false)}
            className={`t-body ${s.renameInput}`}
            defaultValue={displayTitle(r)}
            aria-label="Session title"
            aria-invalid={renameErr || undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(e.currentTarget.value);
              if (e.key === "Escape") {
                cancelled.current = true;
                setRenameErr(false);
                onRenameDone(false);
              }
            }}
            onBlur={(e) => save(e.currentTarget.value)}
          />
        ) : (
          <span className={`t-body ${s.title}`} title={r.suggested_title ? r.title : undefined}>
            {displayTitle(r)}
          </span>
        )}
        <span className={`t-caption ${s.sub}`}>
          {renameErr ? "Couldn't rename — press Enter to retry" : subtitle(r)}
        </span>
      </span>
      {badge(r)}
      {unread > 0 && (
        <Chip filled title="New events since you last opened it">
          {unread}
        </Chip>
      )}
    </>
  );

  return (
    <li className={`${s.row}${selected ? ` ${s.rowSelected}` : ""}`}>
      {selecting &&
        (r.shared ? (
          <span className={s.check} aria-hidden />
        ) : (
          <input
            type="checkbox"
            className={s.check}
            checked={selected}
            onChange={() => onToggle(r.id)}
            aria-label={`Select ${displayTitle(r)}`}
          />
        ))}
      {renaming ? (
        <div className={s.rowLink}>{body}</div>
      ) : (
        <Link href={`/session/${r.id}`} className={s.rowLink}>
          {body}
        </Link>
      )}
      {menu}
    </li>
  );
}
