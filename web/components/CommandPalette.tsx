"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/ui/Dialog";
import Icon, { type IconName } from "@/components/ui/Icon";
import StatusBadge from "@/components/ui/StatusBadge";
import { useSessions, byRecent } from "@/components/SessionsContext";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { logout, type Me } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { timeAgo } from "@/lib/utils";
import { mod } from "./Shortcuts";
import s from "./shell.module.css";

export type DocLink = { slug: string; title: string };

type Item = {
  id: string;
  section: "Actions" | "Sessions" | "Shared" | "Docs";
  title: string;
  subtitle: string;
  icon: IconName;
  live?: boolean;
  run: () => void;
};

/** Subsequence match, as on the Mac: "nse" finds "New session". */
export function fuzzy(q: string, text: string) {
  let i = 0;
  for (const c of text.toLowerCase()) if (c === q[i]) i++;
  return i === q.length;
}

const THEME_NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

/**
 * ⌘K — Mac/Palette/CommandPaletteView.swift: "›" prompt, Actions, Sessions,
 * Shared and Docs, ↑↓ / ⏎ / esc. A combobox over a grouped listbox.
 */
export default function CommandPalette({
  open,
  onClose,
  user,
  docs,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  user: Me;
  docs: DocLink[];
  onHelp: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Command palette">
      {/* Dialog mounts children only while open, so each open starts fresh. */}
      <Palette onClose={onClose} user={user} docs={docs} onHelp={onHelp} />
    </Dialog>
  );
}

function Palette({
  onClose,
  user,
  docs,
  onHelp,
}: {
  onClose: () => void;
  user: Me;
  docs: DocLink[];
  onHelp: () => void;
}) {
  const router = useRouter();
  const { mine, shared } = useSessions();
  const { mode, setMode } = useTheme();
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // Dialog's showModal runs after this child mounts and focuses its first
  // control (Close), so take focus back on the next tick.
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus());
    return () => clearTimeout(t);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const go = (href: string) => () => router.push(href);
    const m = mod();
    const actions: Item[] = (
      [
      { title: "New session", subtitle: `${m}N`, icon: "plus", run: go(ROUTES.newSession) },
      { title: "Sessions", subtitle: "Home", icon: "list.bullet", run: go(ROUTES.sessions) },
      { title: "Live sessions", subtitle: "Streaming now", icon: "dot.radiowaves.left.and.right", run: go(ROUTES.live) },
      { title: "Shared with me", subtitle: "Sessions others shared", icon: "person.2", run: go(ROUTES.shared) },
      { title: "Feed", subtitle: "Public sessions", icon: "square.grid.2x2", run: go("/feed") },
      { title: "Docs", subtitle: "How LiveShortly works", icon: "book", run: go("/docs") },
      { title: "Install the CLI", subtitle: "live for macOS, Linux, Windows", icon: "arrow.down.to.line", run: go("/install") },
      { title: "Changelog", subtitle: "What's new", icon: "clock", run: go("/changelog") },
      { title: "Settings", subtitle: "Account, notifications, machines", icon: "gearshape", run: go("/settings") },
      { title: "Profile", subtitle: user.handle ? `@${user.handle}` : "Your profile", icon: "person.crop.circle", run: go("/profile") },
      ...(user.is_admin
        ? [{ title: "Admin", subtitle: "Users and sessions", icon: "lock", run: go("/admin") }]
        : []),
      { title: "Switch theme", subtitle: `Now ${mode}, next ${THEME_NEXT[mode]}`, icon: "circle.lefthalf.filled", run: () => setMode(THEME_NEXT[mode]) },
      { title: "Keyboard shortcuts", subtitle: "?", icon: "keyboard", run: onHelp },
      {
        title: "Sign out",
        subtitle: user.email ?? "",
        icon: "rectangle.portrait.and.arrow.right",
        run: () => void logout().finally(() => window.location.assign("/")),
      },
      ] as Omit<Item, "id" | "section">[]
    ).map((a) => ({ ...a, id: `a-${a.title}`, section: "Actions" as const }));

    const take = <T,>(arr: T[], n: number) => arr.slice(0, q ? 20 : n);
    const sessions = take(
      [...(mine ?? [])]
        .sort((a, b) => (a.status === "live") === (b.status === "live") ? byRecent(a, b) : a.status === "live" ? -1 : 1)
        .filter((x) => fuzzy(q, x.title || "untitled session")),
      6,
    ).map<Item>((x) => ({
      id: `s-${x.id}`,
      section: "Sessions",
      title: x.title || "Untitled session",
      subtitle: x.status === "live" ? "Live" : `${timeAgo(x.ended_at ?? x.created_at)} ago`,
      icon: "terminal",
      live: x.status === "live",
      run: go(ROUTES.session(x.id)),
    }));
    const sharedItems = take(
      [...(shared ?? [])].sort(byRecent).filter((x) => fuzzy(q, `${x.title} ${x.owner_handle}`)),
      4,
    ).map<Item>((x) => ({
      id: `sh-${x.id}`,
      section: "Shared",
      title: x.title || "Untitled session",
      subtitle: `@${x.owner_handle}`,
      icon: "person.2",
      live: x.status === "live",
      run: go(ROUTES.session(x.id)),
    }));
    const docItems = take(
      docs.filter((d) => fuzzy(q, d.title)),
      4,
    ).map<Item>((d) => ({
      id: `d-${d.slug}`,
      section: "Docs",
      title: d.title,
      subtitle: "Docs",
      icon: "book",
      run: go(`/docs/${d.slug}`),
    }));
    return [...actions.filter((a) => fuzzy(q, a.title)), ...sessions, ...sharedItems, ...docItems];
  }, [query, mine, shared, docs, user, mode, setMode, router, onHelp]);

  const sel = Math.min(hi, Math.max(0, results.length - 1));
  const run = (i: number) => {
    const it = results[i];
    if (!it) return;
    onClose();
    it.run();
  };

  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = results.length;
    if (!n) return;
    if (e.key === "ArrowDown") setHi((sel + 1) % n);
    else if (e.key === "ArrowUp") setHi((sel - 1 + n) % n);
    else if (e.key === "Enter") run(sel);
    else return;
    e.preventDefault();
  };

  const sections = ["Actions", "Sessions", "Shared", "Docs"] as const;
  return (
    <div className={s.palette}>
      <div className={s.paletteField}>
        <span className={s.prompt} aria-hidden>
          ›
        </span>
        <input
          ref={input}
          role="combobox"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-activedescendant={results[sel] ? `${id}-${sel}` : undefined}
          aria-autocomplete="list"
          aria-label="Jump to a session or action"
          placeholder="Jump to a session or action"
          className="t-body"
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setHi(0);
          }}
          onKeyDown={onKey}
        />
      </div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Results" className={s.paletteList}>
        {results.length === 0 && <p className={`${s.paletteEmpty} t-callout`}>Nothing matches “{query}”</p>}
        {sections.map((sec) => {
          const items = results.map((r, i) => [r, i] as const).filter(([r]) => r.section === sec);
          if (!items.length) return null;
          return (
            <div key={sec} role="group" aria-labelledby={`${id}-${sec}`}>
              <div id={`${id}-${sec}`} className={`${s.sectionLabel} t-caption`}>
                {sec}
              </div>
              {items.map(([r, i]) => (
                <div
                  key={r.id}
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === sel}
                  className={s.paletteRow}
                  onMouseMove={() => i !== sel && setHi(i)}
                  onClick={() => run(i)}
                >
                  <Icon name={r.icon} />
                  <span className={`${s.paletteTitle} t-body`}>{r.title}</span>
                  {r.live && <StatusBadge status="live" />}
                  <span className={`${s.paletteSub} t-callout`}>{r.subtitle}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className={`${s.paletteFoot} t-caption`}>
        <span>↑↓ move · ⏎ open · esc close</span>
        <span>
          {results.length} result{results.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
