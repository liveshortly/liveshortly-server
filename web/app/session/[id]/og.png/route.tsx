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
// stop previewing soon. The .png path is what lets Cloudflare cache it at the
// edge (it skips extensionless paths by default); crawlers like X give up on
// a slow image, and a cold render takes seconds.
const TTL_MS = 600_000;
const HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600",
};

// Rendered cards by id + ?v, so a crawler burst (and Cloudflare's per-PoP
// misses) render once. ponytail: in-process map, per web instance; move to a
// shared store if the site ever runs more than one.
const rendered = new Map<string, { png: ArrayBuffer; at: number }>();
const MAX_CACHED = 200;

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = `${id}|${new URL(req.url).searchParams.get("v") ?? ""}`;
  const hit = rendered.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return new Response(hit.png, { headers: HEADERS });

  const png = await new ImageResponse(ogCard(await props(id)), { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer();
  rendered.delete(key);
  rendered.set(key, { png, at: Date.now() });
  if (rendered.size > MAX_CACHED) rendered.delete(rendered.keys().next().value!);
  return new Response(png, { headers: HEADERS });
}
