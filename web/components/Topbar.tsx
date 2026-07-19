"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import Avatar from "@/components/Avatar";
import type { Me } from "@/lib/api";

/**
 * Global authenticated topbar — designs/version3/feed.html `.topbar`. Search
 * submits to /feed?q=… (Feed.tsx seeds its query from that param); the
 * notifications icon is decorative (no backend notification feed exists).
 */
const HOME_TABS = [
  { key: "live", href: "/?tab=live", label: "Live now" },
  { key: "feed", href: "/?tab=feed", label: "◈ Feed" },
  { key: "published", href: "/?tab=published", label: "▣ Published" },
] as const;

export default function Topbar({ user }: { user: Me }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");

  // Tabs are active only on the home route; default to Feed there.
  const onHome = pathname === "/";
  const activeTab = onHome ? params.get("tab") ?? "feed" : null;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/feed?q=${encodeURIComponent(query)}` : "/feed");
  };

  return (
    <div className="v3-topbar">
      <Link href="/" className="v3-brand" aria-label="LiveShortly home">
        <BrandMark />
        LiveShortly
      </Link>

      <nav className="v3-htabs" aria-label="Feed views">
        {HOME_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`v3-htab${activeTab === t.key ? " on" : ""}`}
          >
            {t.key === "live" && <span className="live-dot" aria-hidden />}
            {t.label}
          </Link>
        ))}
      </nav>

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
        <Link href="/profile" aria-label="Your profile" title={user.name ?? user.email ?? "Profile"}>
          <Avatar
            seed={user.id ?? user.email ?? user.name}
            size={30}
            rounded={false}
          />
        </Link>
      </div>
    </div>
  );
}
