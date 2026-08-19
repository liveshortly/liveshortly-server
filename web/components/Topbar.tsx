"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import Avatar from "@/components/Avatar";
import ProfileMenu from "@/components/ProfileMenu";
import NewSessionButton from "@/components/NewSessionButton";
import DaemonStatus from "@/components/DaemonStatus";
import type { Me } from "@/lib/api";

/**
 * Global authenticated topbar — designs/version3/feed.html `.topbar`. Search
 * submits to /feed?q=… (Feed.tsx seeds its query from that param); the
 * notifications icon is decorative (no backend notification feed exists).
 */
export default function Topbar({
  user,
  onMenu,
  menuOpen,
}: {
  user: Me;
  onMenu?: () => void;
  menuOpen?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/feed?q=${encodeURIComponent(query)}` : "/feed");
  };

  return (
    <div className="v3-topbar">
      {onMenu && (
        <button
          type="button"
          className="v3-menu-btn"
          onClick={onMenu}
          aria-label={menuOpen ? "Hide sessions" : "Show sessions"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      )}

      <Link href="/" className="v3-brand" aria-label="LiveShortly home">
        <BrandMark />
        LiveShortly
      </Link>

      <form className="v3-searchpill" onSubmit={submitSearch} role="search">
        <span aria-hidden>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sessions, owners, tags…"
          aria-label="Search sessions"
          spellCheck={false}
        />
      </form>

      <div className="v3-top-actions">
        <DaemonStatus />
        {/* Renders only for accounts with a machine running `live daemon`. */}
        <NewSessionButton />
        <Link href="/docs" className="v3-install-link" title="Platform Documentation">
          Docs
        </Link>
        <Link href="/install" className="v3-install-link" title="Install the CLI">
          ⇩ Install CLI
        </Link>
        <span
          className="v3-icon-btn"
          title="Notifications — coming soon"
          aria-hidden
        >
          🔔
        </span>
        <Link href="/hud" className="v3-icon-btn" title="Shared with me">
          🔗
        </Link>
        <ThemeToggle />
        <ProfileMenu user={user} direction="down" align="end">
          <Avatar
            seed={user.id ?? user.email ?? user.name}
            size={30}
            rounded={false}
            title={user.name ?? user.email ?? "Account"}
          />
        </ProfileMenu>
      </div>
    </div>
  );
}
