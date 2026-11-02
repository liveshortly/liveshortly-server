"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";
import { useSessions } from "@/components/SessionsContext";
import { ROUTES } from "@/lib/routes";
import s from "./shell.module.css";

/** Phone (<768) navigation in place of the sidebar: Sessions, Live, Shared, Me. */
export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const filter = useSearchParams()?.get("filter") ?? null;
  const { mine } = useSessions();
  const liveCount = (mine ?? []).filter((x) => x.status === "live").length;

  const tabs: { href: string; label: string; icon: IconName; on: boolean; badge?: number }[] = [
    { href: ROUTES.sessions, label: "Sessions", icon: "list.bullet", on: pathname === "/sessions" && !filter },
    {
      href: ROUTES.live,
      label: "Live",
      icon: "dot.radiowaves.left.and.right",
      on: pathname === "/sessions" && filter === "live",
      badge: liveCount,
    },
    { href: ROUTES.shared, label: "Shared", icon: "person.2", on: pathname === "/sessions" && filter === "shared" },
    {
      href: "/profile",
      label: "Me",
      icon: "person.crop.circle",
      on: pathname.startsWith("/profile") || pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav aria-label="App" className={s.tabBar}>
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} aria-current={t.on ? "page" : undefined} className={s.tab}>
          <Icon name={t.icon} size={20} />
          <span className="t-callout">{t.label}</span>
          {!!t.badge && (
            <span className={`${s.count} t-metric`} aria-label={`${t.badge} live`}>
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
