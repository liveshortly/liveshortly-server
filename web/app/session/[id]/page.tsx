import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shareTitle } from "@/lib/ogCard";
import { loadPublicSession } from "@/lib/publicSession";
import { fmtInt, frameworkLabel, timeAgo } from "@/lib/utils";
import SessionClient from "./SessionClient";

// SessionClient refetches with the visitor's cookie, and that fetch counts the view.
const loadSession = (id: string) => loadPublicSession(id, false);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await loadSession(id);
  if (!s || s === "missing") return { title: "Session" };

  const title = shareTitle(s);
  const live = s.status === "live";
  const agent = s.framework ? frameworkLabel(s.framework) : null;
  const desc =
    [agent, s.model, live ? "live now" : `ended ${timeAgo(s.ended_at ?? s.created_at)}`, `${fmtInt(s.event_count)} events`]
      .filter(Boolean)
      .join(" · ") + ` — watch @${s.owner_handle} on LiveShortly`;
  const url = `/session/${id}`;
  // og.png/route.tsx renders the card; ?v= changes as the session grows or ends so
  // crawlers refetch it (LSW-37).
  const image = {
    url: `${url}/og.png?v=${s.event_count}${live ? "l" : "e"}`,
    width: 1200,
    height: 630,
    alt: title,
  };

  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description: desc, url, images: [image] },
    twitter: { card: "summary_large_image", title, description: desc, images: [image] },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const s = await loadSession((await params).id);
  if (s === "missing") notFound();
  return <SessionClient params={params} initial={s} />;
}
