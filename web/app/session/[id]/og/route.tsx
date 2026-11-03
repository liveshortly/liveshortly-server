import { ImageResponse } from "next/og";
import { getSession } from "@/lib/api";
import { ogCard, OG_SIZE, shareTitle, SITE_CARD, type OgCardProps } from "@/lib/ogCard";
import { ogFonts } from "@/lib/ogFonts";
import { cardExcerpt, lastEdit, shareSafe } from "@/lib/transcript";
import { fmtInt, frameworkLabel, truncate } from "@/lib/utils";

// Per-session share image (LSW-37). page.tsx links it with a ?v= that changes
// as the session grows or ends, so crawlers refetch live sessions. Node runtime
// because it reaches the internal API. The fetch is cookieless, so only an open
// session's redacted public view reaches the card; anything else (private,
// deleted, API down) gets the generic card with nothing leaked.

// Short shared-cache life: a session made private, renamed or deleted must
// stop previewing soon.
const HEADERS = { "Cache-Control": "public, max-age=600, stale-while-revalidate=600" };

function duration(from: string, to: string | null): string | null {
  const mins = Math.round((new Date(to ?? Date.now()).getTime() - new Date(from).getTime()) / 60000);
  if (!(mins >= 0)) return null;
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

async function props(id: string): Promise<OgCardProps> {
  try {
    const s = await getSession(id, AbortSignal.timeout(3000), undefined, false); // a crawler, not a view
    const live = s.status === "live";
    return {
      title: truncate(shareTitle(s), 120),
      status: s.status,
      framework: s.framework,
      agent: s.framework ? frameworkLabel(s.framework) : null,
      model: s.model,
      excerpt: truncate(cardExcerpt(s.events) ?? shareSafe(s.hero) ?? "", 260) || null,
      edit: lastEdit(s.events),
      meta: [
        `@${s.owner_handle}`,
        duration(s.created_at, s.ended_at),
        `${fmtInt(s.event_count)} events`,
        live && s.watcher_count ? `${fmtInt(s.watcher_count)} watching` : `${fmtInt(s.view_count)} views`,
      ].filter((x): x is string => !!x),
    };
  } catch {
    return SITE_CARD;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return new ImageResponse(ogCard(await props(id)), {
    ...OG_SIZE,
    fonts: ogFonts(),
    headers: HEADERS,
  });
}
