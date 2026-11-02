// Pure helpers behind components/SessionList (LSW-09). No React, no fetch.

export const DATE_GROUPS = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
] as const;
export type DateGroup = (typeof DATE_GROUPS)[number];

/** Mac All chats buckets (AllListsView.swift): calendar days in local time. */
export function dateGroup(ts: number, now = new Date()): DateGroup {
  const day = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).getTime();
  if (ts >= day(0)) return "Today";
  if (ts >= day(1)) return "Yesterday";
  if (ts >= day(7)) return "Previous 7 days";
  if (ts >= day(30)) return "Previous 30 days";
  return "Older";
}

/** Buckets already-sorted rows, keeping row order and DATE_GROUPS order. */
export function groupByDate<T>(rows: T[], ts: (r: T) => number, now = new Date()) {
  const by = new Map<DateGroup, T[]>();
  for (const r of rows) {
    const g = dateGroup(ts(r), now);
    by.set(g, [...(by.get(g) ?? []), r]);
  }
  return DATE_GROUPS.filter((g) => by.has(g)).map((label) => ({ label, rows: by.get(label)! }));
}

/** Runs fn on every item; resolves to the items whose call failed. */
export async function runBulk<T>(items: T[], fn: (t: T) => Promise<unknown>): Promise<T[]> {
  const res = await Promise.allSettled(items.map(fn));
  return items.filter((_, i) => res[i].status === "rejected");
}

/** "git@github.com:acme/app.git" / "https://github.com/acme/app" → "acme/app". */
export function repoName(remote: string | null | undefined): string {
  if (!remote) return "";
  return remote.replace(/\.git$/, "").split(/[/:]/).filter(Boolean).slice(-2).join("/");
}

/** "rohit@rohits-mbp" → "rohits-mbp". */
export function machineName(handle: string | null | undefined): string {
  return handle ? handle.slice(handle.lastIndexOf("@") + 1) : "";
}
