import type { Metadata } from "next";
import Feed from "@/components/Feed";
import { getFeed } from "@/lib/api";

export const metadata: Metadata = {
  title: "Feed",
  description:
    "Published Claude Code, Codex and Gemini sessions — watch live or replay.",
};

/** /feed — full browse/search feed. Reached by anonymous guests directly and
 *  by authenticated users via the topbar search or "See all" links. The first
 *  page is fetched here (cookieless: the public feed only) so it ships in the
 *  HTML; a failed fetch leaves it to the client. */
export default async function FeedRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const initial = await getFeed(
    { q, limit: 24 },
    AbortSignal.timeout(3000),
  ).catch(() => null);
  return <Feed initial={initial} />;
}
