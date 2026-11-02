import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sessionTitle } from "@/lib/api";
import { loadPublicSession } from "@/lib/publicSession";
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

  const title = sessionTitle(s);
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
  const s = await loadSession((await params).id);
  if (s === "missing") notFound();
  return <SessionClient params={params} initial={s} />;
}
