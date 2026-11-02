"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import Avatar from "@/components/Avatar";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationBell from "@/components/NotificationBell";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/Button";
import { loginUrl, type Me } from "@/lib/api";
import { SITE_LINKS } from "@/lib/routes";
import { mod } from "./Shortcuts";
import s from "./shell.module.css";

/**
 * The one header, signed in or out (LSW-03): logo, Feed · Docs · Install ·
 * Changelog, theme, then Sign in — or, signed in, the ⌘K search, the
 * approvals bell (LSW-21) and the account menu. Under 768px the links move
 * into a menu sheet so none disappears.
 */
export default function Topbar({
  user,
  pending,
  onMenu,
  menuOpen,
  onSearch,
}: {
  user: Me | null;
  /** Signed-out header while /api/me is in flight: hide "Sign in" (no flash). */
  pending?: boolean;
  /** Tablet sidebar toggle. */
  onMenu?: () => void;
  menuOpen?: boolean;
  onSearch?: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const pathname = usePathname() ?? "/";
  const current = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;

  return (
    <header className={s.header}>
      {onMenu && (
        <span className={s.tabletOnly}>
          <IconButton
            icon={menuOpen ? "xmark" : "line.3.horizontal"}
            label={menuOpen ? "Hide sidebar" : "Show sidebar"}
            aria-expanded={menuOpen}
            onClick={onMenu}
          />
        </span>
      )}

      <Link href={user ? "/sessions" : "/"} className={s.brand} aria-label="LiveShortly home">
        <BrandMark />
        <span>LiveShortly</span>
      </Link>

      <nav aria-label="Site" className={s.siteNav}>
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current(l.href)} className="t-callout">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className={s.headerEnd}>
        {onSearch && (
          <>
            <button type="button" className={`${s.searchBtn} t-callout`} onClick={onSearch}>
              <Icon name="magnifyingglass" size={14} />
              <span>Search or jump to…</span>
              <kbd>{mod()}K</kbd>
            </button>
            <span className={s.phoneOnly}>
              <IconButton icon="magnifyingglass" label="Search" onClick={onSearch} />
            </span>
          </>
        )}
        {user && <NotificationBell />}
        <ThemeToggle />
        {user ? (
          <ProfileMenu user={user} direction="down" align="end">
            <Avatar
              seed={user.id ?? user.email ?? user.name}
              size={28}
              rounded={false}
              title={user.name ?? user.email ?? "Account"}
            />
          </ProfileMenu>
        ) : (
          // Hidden (not removed) until /api/me answers, so nothing shifts.
          <a
            href={loginUrl()}
            className={`${s.signIn} t-headline`}
            style={pending ? { visibility: "hidden" } : undefined}
          >
            Sign in
          </a>
        )}
        <span className={s.phoneOnly}>
          <IconButton icon="ellipsis" label="Menu" aria-haspopup="dialog" onClick={() => setSheet(true)} />
        </span>
      </div>

      <Dialog open={sheet} onClose={() => setSheet(false)} title="LiveShortly" sheet>
        <nav aria-label="Site" className={s.sheetNav}>
          {SITE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current(l.href)}
              className="t-body"
              onClick={() => setSheet(false)}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <Link href="/settings" className="t-body" onClick={() => setSheet(false)}>
              Settings
            </Link>
          )}
        </nav>
      </Dialog>
    </header>
  );
}
