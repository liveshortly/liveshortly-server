"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ShareDialog from "@/components/ShareDialog";
import SessionsRightRail from "@/components/SessionsRightRail";
import {
  deleteSession,
  isPublished,
  listSessions,
  publishSession,
  unpublishSession,
  type Session,
} from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

const POLL_MS = 5000;

type Row = Session & { shared: boolean };
type Tab = "all" | "live" | "published" | "shared";
type View = "list" | "grid";
type Sort = "recent" | "watchers" | "events" | "az";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "published", label: "Published" },
  { key: "shared", label: "Shared with me" },
];

/** Pixel match of designs/version4/sessions/index.html — a filterable list/
 *  grid browser of all your sessions (own + shared), with tab/sort/tag
 *  filtering, select-mode bulk actions, and the same resume hero + right
 *  rail as /hud. */
export default function Page() {
  const [mine, setMine] = useState<Session[] | null>(null);
  const [shared, setShared] = useState<Session[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<Row | null>(null);
  const bulkShareBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        listSessions({ scope: "mine", status: "all", limit: 200 }),
        listSessions({ scope: "shared", status: "all", limit: 100 }),
      ]);
      setMine(m.results);
      setShared(s.results);
      setMineErr(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMineErr("Could not load your sessions.");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const updateRow = (u: Session) => {
    setMine((cur) => cur?.map((s) => (s.id === u.id ? { ...s, ...u } : s)) ?? cur);
    setShared((cur) => cur?.map((s) => (s.id === u.id ? { ...s, ...u } : s)) ?? cur);
  };
  const removeRow = (id: string) => {
    setMine((cur) => cur?.filter((s) => s.id !== id) ?? cur);
    setShared((cur) => cur?.filter((s) => s.id !== id) ?? cur);
    setSelected((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
  };

  const rows: Row[] | null = useMemo(() => {
    if (mine === null || shared === null) return null;
    return [
      ...mine.map((s) => ({ ...s, shared: false })),
      ...shared.map((s) => ({ ...s, shared: true })),
    ];
  }, [mine, shared]);

  const live = useMemo(() => (mine ?? []).filter((s) => s.status === "live"), [mine]);
  const resumeSession = live[0] ?? null;
  const loaded = mine !== null;

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      all: list.length,
      live: list.filter((s) => s.status === "live").length,
      published: list.filter((s) => isPublished(s)).length,
      shared: list.filter((s) => s.shared).length,
    };
  }, [rows]);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const s of rows ?? []) for (const t of s.tags) seen.add(t);
    return [...seen];
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let list = rows;
    if (tab === "live") list = list.filter((s) => s.status === "live");
    else if (tab === "published") list = list.filter((s) => isPublished(s));
    else if (tab === "shared") list = list.filter((s) => s.shared);

    if (activeTag) list = list.filter((s) => s.tags.includes(activeTag));

    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)),
      );

    return sortRows(list, sort);
  }, [rows, tab, activeTag, query, sort]);

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelected(new Set());
  };
  const toggleSelect = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedOwned = () =>
    [...selected].map((id) => rows?.find((r) => r.id === id)).filter((r): r is Row => !!r && !r.shared);

  const bulkPublish = async () => {
    const targets = selectedOwned().filter((r) => !isPublished(r));
    if (targets.length === 0) return;
    await Promise.allSettled(targets.map((r) => publishSession(r.id)));
    await load();
  };

  const bulkDelete = async () => {
    const targets = selectedOwned();
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Delete ${targets.length} session${targets.length === 1 ? "" : "s"} forever? This can't be undone.`,
      )
    )
      return;
    await Promise.allSettled(targets.map((r) => deleteSession(r.id)));
    setSelected(new Set());
    await load();
  };

  const bulkShare = () => {
    const targets = selectedOwned();
    if (targets.length !== 1) return;
    setShareTarget(targets[0]);
  };

  return (
    <div className="v3-page-wrap">
      <div className="v3-page-main">
        <div className="v3-eyebrow">⌂ Sessions</div>

        {resumeSession ? (
          <Link href={`/session/${resumeSession.id}`} className="hud-hero" style={{ textDecoration: "none" }}>
            <div className="hud-hero-text">
              <div className="hk">Continue where you left off</div>
              <div className="ht">{resumeSession.title || "untitled session"}</div>
              <div className="hs">
                Started {timeAgo(resumeSession.created_at)} · {fmtInt(resumeSession.event_count)} events
              </div>
              {resumeSession.hero && (
                <div className="hud-hero-snippet">
                  <span className="glyph">▸</span>
                  {resumeSession.hero}
                </div>
              )}
            </div>
            <span className="hud-hero-cta">▶ Resume watching</span>
          </Link>
        ) : (
          loaded && (
            <div className="hud-idle">
              No live session right now. Run <code>live claude</code> to start
              streaming — it shows up here the moment it goes live.
            </div>
          )
        )}

        {mineErr && <ErrorBar text={mineErr} />}

        <div className="s4-page-head">
          <div className="s4-page-title">
            All sessions<span className="tnum">· {filtered.length}</span>
          </div>
          <div className="s4-head-actions">
            <button
              type="button"
              className={`s4-btn${selectMode ? " primary" : ""}`}
              onClick={toggleSelectMode}
            >
              ☑ Select
            </button>
            <div className="s4-view-toggle">
              <button
                type="button"
                className={view === "list" ? "active" : ""}
                title="List view"
                onClick={() => setView("list")}
              >
                ☰
              </button>
              <button
                type="button"
                className={view === "grid" ? "active" : ""}
                title="Grid view"
                onClick={() => setView("grid")}
              >
                ▦
              </button>
            </div>
          </div>
        </div>

        <div className="s4-toolbar">
          <div className="s4-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`s4-tab${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.key === "live" && <span className="live-dot" style={{ width: 5, height: 5 }} />}
                {t.label} <span className="n">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="s4-toolbar-right">
            <select
              className="s4-sort-select"
              aria-label="Sort sessions"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="recent">Sort: Recent</option>
              <option value="watchers">Sort: Most watched</option>
              <option value="events">Sort: Longest</option>
              <option value="az">Sort: A–Z</option>
            </select>
            <div className="s4-filter-search">
              ⌕{" "}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter title or tag…"
                aria-label="Filter sessions"
              />
            </div>
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="s4-tag-strip">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                className={`s4-tag-chip${activeTag === t ? " active" : ""}`}
                onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {!loaded ? (
          <div className="s4-empty">LOADING…</div>
        ) : filtered.length === 0 ? (
          <div className="s4-empty">
            {rows && rows.length === 0
              ? "No sessions yet — run live claude to start one."
              : "No sessions match this filter."}
          </div>
        ) : view === "list" ? (
          <div className="s4-rows">
            {filtered.map((s) => (
              <ListRow
                key={s.id}
                s={s}
                selectMode={selectMode}
                selected={selected.has(s.id)}
                onToggleSelect={toggleSelect}
                onChanged={updateRow}
                onDeleted={removeRow}
              />
            ))}
          </div>
        ) : (
          <div className="s4-grid">
            {filtered.map((s) => (
              <GridCard
                key={s.id}
                s={s}
                selectMode={selectMode}
                selected={selected.has(s.id)}
                onToggleSelect={toggleSelect}
                onChanged={updateRow}
                onDeleted={removeRow}
              />
            ))}
          </div>
        )}

        {selectMode && selected.size > 0 && (
          <div className="s4-bulk-bar">
            <span className="s4-bulk-count">{selected.size} selected</span>
            <div className="s4-bulk-actions">
              <button type="button" className="s4-rbtn" onClick={bulkPublish}>
                ⊕ Publish
              </button>
              <button
                ref={bulkShareBtnRef}
                type="button"
                className="s4-rbtn"
                disabled={selectedOwned().length !== 1}
                title={selectedOwned().length !== 1 ? "Select exactly one session to share" : undefined}
                onClick={bulkShare}
              >
                ⊕ Share
              </button>
              <button type="button" className="s4-rbtn danger" onClick={bulkDelete}>
                ⌫ Delete
              </button>
              <button type="button" className="s4-btn" onClick={toggleSelectMode}>
                Cancel
              </button>
            </div>
            {shareTarget && (
              <ShareDialog
                sessionId={shareTarget.id}
                title={shareTarget.title}
                anchorEl={bulkShareBtnRef.current}
                onClose={() => setShareTarget(null)}
              />
            )}
          </div>
        )}
      </div>

      <SessionsRightRail mine={mine} />
    </div>
  );
}

function timeLabel(s: Row): string {
  return s.status === "live"
    ? `Started ${timeAgo(s.created_at)}`
    : `Ended ${timeAgo(s.ended_at ?? s.created_at)}`;
}

function badge(s: Row) {
  if (s.status === "live")
    return (
      <span className="s4-badge live">
        <span className="live-dot" />
        Live
      </span>
    );
  if (s.shared) return <span className="s4-badge shared">Shared</span>;
  if (isPublished(s)) return <span className="s4-badge published">Published</span>;
  return <span className="s4-badge">Ended</span>;
}

function sortRows(list: Row[], sort: Sort): Row[] {
  const copy = [...list];
  if (sort === "watchers") copy.sort((a, b) => b.view_count - a.view_count);
  else if (sort === "events") copy.sort((a, b) => b.event_count - a.event_count);
  else if (sort === "az") copy.sort((a, b) => a.title.localeCompare(b.title));
  else copy.sort((a, b) => activityTs(b) - activityTs(a));
  return copy;
}

function activityTs(s: Row): number {
  return +new Date(s.ended_at ?? s.created_at);
}

/** Publish/unpublish + delete, shared by the list-row and grid-card action
 *  icons. Publish always uses the "anyone signed in" reach (the row/card
 *  icon is a one-click toggle, not the full reach picker PublishAction
 *  offers on the session detail page). */
function useRowActions(s: Row, onChanged: (u: Session) => void, onDeleted: (id: string) => void) {
  const [busy, setBusy] = useState(false);
  const published = isPublished(s);

  const togglePublish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = published ? await unpublishSession(s.id) : await publishSession(s.id);
      onChanged(updated);
    } catch {
      // leave state unchanged on error
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (busy) return;
    if (!window.confirm("Delete this session forever? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteSession(s.id);
      onDeleted(s.id);
    } catch {
      setBusy(false);
    }
  };

  return { busy, published, togglePublish, onDelete };
}

function ListRow({
  s,
  selectMode,
  selected,
  onToggleSelect,
  onChanged,
  onDeleted,
}: {
  s: Row;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onChanged: (u: Session) => void;
  onDeleted: (id: string) => void;
}) {
  const { busy, published, togglePublish, onDelete } = useRowActions(s, onChanged, onDeleted);
  const [shareOpen, setShareOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="s4-row">
      {selectMode && (
        <input
          type="checkbox"
          className="s4-row-check"
          checked={selected}
          onChange={() => onToggleSelect(s.id)}
          aria-label={`Select ${s.title || "untitled session"}`}
        />
      )}
      <Link href={`/session/${s.id}`} className="s4-row-link">
        <div className="hud-row-swatch">
          <div className="hud-row-play">▶</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="s4-row-title">{s.title || "untitled session"}</div>
          <div className="s4-row-sub">
            {s.model ?? "—"} · {timeLabel(s)}
            {s.shared ? ` · @${s.owner_handle} · ${s.shared_role ?? "viewer"}` : ""}
            {s.tags.map((t) => (
              <span className="s4-tag" key={t}>
                #{t}
              </span>
            ))}
          </div>
        </div>
        {badge(s)}
        <div className="s4-row-meta">
          <div className="s4-row-watchers">{s.view_count ? `◔ ${fmtInt(s.view_count)}` : ""}</div>
          <div className="s4-row-events tnum">{fmtInt(s.event_count)} ev</div>
        </div>
      </Link>
      {!s.shared && (
        <div className="s4-row-icons">
          <button type="button" className="s4-rbtn" disabled={busy} onClick={togglePublish}>
            {published ? "● Unpublish" : "⊕ Publish"}
          </button>
          <button
            ref={shareBtnRef}
            type="button"
            className="s4-rbtn"
            onClick={() => setShareOpen((v) => !v)}
          >
            ⊕ Share
          </button>
          <button type="button" className="s4-rbtn danger" disabled={busy} onClick={onDelete}>
            ⌫ Delete
          </button>
          {shareOpen && (
            <ShareDialog
              sessionId={s.id}
              title={s.title}
              anchorEl={shareBtnRef.current}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function GridCard({
  s,
  selectMode,
  selected,
  onToggleSelect,
  onChanged,
  onDeleted,
}: {
  s: Row;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onChanged: (u: Session) => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const { busy, published, togglePublish, onDelete } = useRowActions(s, onChanged, onDeleted);

  return (
    <div
      className="s4-gcard"
      onClick={() => router.push(`/session/${s.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/session/${s.id}`);
      }}
    >
      <div className="s4-gcard-cover">
        {selectMode ? (
          <input
            type="checkbox"
            className="s4-row-check"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(s.id)}
            aria-label={`Select ${s.title || "untitled session"}`}
          />
        ) : (
          <span />
        )}
        {badge(s)}
        <div className="s4-gcard-play">▶</div>
      </div>
      <div className="s4-gcard-body">
        <div className="s4-gcard-title">{s.title || "untitled session"}</div>
        <div className="s4-gcard-sub">
          {s.model ?? "—"} · {timeLabel(s)}
        </div>
        <div className="s4-gcard-tags">
          {s.tags.map((t) => (
            <span className="s4-tag" key={t}>
              #{t}
            </span>
          ))}
        </div>
        <div className="s4-gcard-foot">
          <div className="s4-gcard-stats">
            <span>{fmtInt(s.event_count)} ev</span>
            {s.view_count > 0 && <span>◔ {fmtInt(s.view_count)}</span>}
          </div>
          {!s.shared && (
            <div className="s4-gcard-icons" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="s4-rbtn"
                disabled={busy}
                title={published ? "Unpublish" : "Publish"}
                onClick={togglePublish}
              >
                {published ? "●" : "⊕"}
              </button>
              <button
                type="button"
                className="s4-rbtn danger"
                disabled={busy}
                title="Delete"
                onClick={onDelete}
              >
                ⌫
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBar({ text }: { text: string }) {
  return (
    <div
      className="label"
      style={{
        border: "1px solid var(--red)",
        color: "var(--red)",
        padding: "8px 12px",
        marginBottom: 20,
      }}
    >
      ⚠ {text}
    </div>
  );
}
