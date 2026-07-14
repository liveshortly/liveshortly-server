import { ImageResponse } from "next/og";
import { getSession, type SessionEvent } from "@/lib/api";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { ogFonts } from "@/lib/ogFonts";
import { shortId, timeAgo, truncate } from "@/lib/utils";

// Node runtime so it can reach the internal API and generate per-request.
export const alt = "LiveShortly session card";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Pull a real line from the session — the first prompt (what the human asked)
 *  or, failing that, the first response — so the card shows genuine content. */
function highlightFrom(events: SessionEvent[] | undefined): string | null {
  if (!events?.length) return null;
  const pick = (type: string) => {
    const e = events.find((x) => x.event_type === type);
    if (!e) return null;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    for (const k of ["message", "text", "content"]) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return truncate(v, 150);
    }
    return null;
  };
  return pick("prompt") ?? pick("response") ?? null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fonts = ogFonts();
  try {
    const s = await getSession(id);
    return new ImageResponse(
      ogCard({
        title: s.title?.trim() || "Untitled session",
        status: s.status,
        model: s.model,
        shortId: shortId(s.id),
        snippet: s.hero ?? s.title ?? null,
        highlight: highlightFrom(s.events),
        owner: s.owner_handle,
        age: timeAgo(s.ended_at ?? s.created_at),
        events: s.event_count,
        views: s.view_count,
        published: !!s.published_at,
      }),
      { ...OG_SIZE, fonts },
    );
  } catch {
    // Private / not-found → generic brand card in the same theme.
    return new ImageResponse(
      ogCard({
        title: "A live coding session",
        subtitle: "Stream your Claude Code sessions",
      }),
      { ...OG_SIZE, fonts },
    );
  }
}
