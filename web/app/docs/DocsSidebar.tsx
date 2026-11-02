"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./docs.module.css";

export interface NavPage {
  slug: string;
  title: string;
  headings: { text: string; id: string }[];
}

/** Left nav (a toggled sheet on mobile) with search over page titles and headings. ⌘K / Ctrl+K focuses search. */
export default function DocsSidebar({ pages }: { pages: NavPage[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        // The sheet is display:none on mobile until open renders.
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile sheet and clear search after navigating.
  useEffect(() => {
    setOpen(false);
    setQ("");
  }, [pathname]);

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
  // ponytail: linear scan over ~15 pages' titles/headings; fine until docs grow to hundreds of pages.
  const results = terms.length
    ? pages.flatMap((p) => [
        ...(hit(p.title) ? [{ href: `/docs/${p.slug}`, text: p.title, page: "" }] : []),
        ...p.headings
          .filter((h) => hit(h.text) || hit(`${p.title} ${h.text}`))
          .map((h) => ({ href: `/docs/${p.slug}#${h.id}`, text: h.text, page: p.title })),
      ]).slice(0, 12)
    : [];

  return (
    <aside className={s.sidebar}>
      <button
        type="button"
        className={s.menuButton}
        aria-expanded={open}
        aria-controls="docs-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close menu" : "Docs menu"}
      </button>
      <div id="docs-nav" className={`${s.sheet} ${open ? s.sheetOpen : ""}`}>
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="docs-search" className={s.srOnly}>
            Search docs
          </label>
          <input
            ref={input}
            id="docs-search"
            type="search"
            className={s.search}
            placeholder="Search docs (⌘K)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            autoComplete="off"
          />
        </form>
        {terms.length > 0 ? (
          <ul className={s.results} aria-live="polite">
            {results.length === 0 && <li className={s.empty}>No matches for “{q}”.</li>}
            {results.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {r.text}
                  {r.page && <span className={s.resultPage}>{r.page}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <nav aria-label="Docs">
            <ul className={s.nav}>
              <li>
                <Link href="/docs" aria-current={pathname === "/docs" ? "page" : undefined}>
                  Overview
                </Link>
              </li>
              {pages.map((p) => {
                const href = `/docs/${p.slug}`;
                return (
                  <li key={p.slug}>
                    <Link href={href} aria-current={pathname === href ? "page" : undefined}>
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </aside>
  );
}
