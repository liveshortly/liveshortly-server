import type { Metadata } from "next";
import { getSession, type SessionDetail } from "@/lib/api";
import SessionClient from "./SessionClient";

/** Fetch the session server-side for metadata. Only publicly-viewable sessions
 *  (visibility "open") resolve for the anonymous crawler; anything else falls
 *  back to generic metadata. Never throws. */
async function loadSession(id: string): Promise<SessionDetail | null> {
  try {
    return await getSession(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await loadSession(id);
  if (!s) return { title: "Session" };

  const title = s.title?.trim() || "Untitled session";
  const status = s.status === "live" ? "LIVE" : "ended";
  const desc =
    `${status} · @${s.owner_handle} · ${s.event_count ?? 0} events` +
    (s.model ? ` · ${s.model}` : "") +
    " — watch on LiveShortly";
  const url = `/session/${id}`;

  return {
    title,
    description: desc,
    openGraph: { type: "article", title, description: desc, url },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SessionClient params={params} />;
}
