import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ApiError, getSession, type SessionDetail } from "@/lib/api";
import SessionClient from "./SessionClient";

/** Fetch the session server-side, WITHOUT the visitor's cookies: only sessions
 *  the public API serves anonymously (visibility "open", already redacted for
 *  non-owners) resolve, so a private session is never rendered into HTML.
 *  "missing" = the API says it doesn't exist (→ real 404); null = needs sign-in
 *  or the API failed, which the client handles with the visitor's cookie.
 *  Cached per request so metadata and page share one API call. */
const loadSession = cache(
  async (id: string): Promise<SessionDetail | "missing" | null> => {
    try {
      return await getSession(id, AbortSignal.timeout(3000));
    } catch (e) {
      return e instanceof ApiError && e.status === 404 ? "missing" : null;
    }
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await loadSession(id);
  if (!s || s === "missing") return { title: "Session" };

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
  const s = await loadSession((await params).id);
  if (s === "missing") notFound();
  return <SessionClient params={params} initial={s} />;
}
