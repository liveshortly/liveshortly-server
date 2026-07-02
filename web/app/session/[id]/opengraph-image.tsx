import { ImageResponse } from "next/og";
import { getSession } from "@/lib/api";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Runs on the Node runtime so it can reach the internal API and fetch per-request.
export const alt = "LiveShortly session card";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const s = await getSession(id);
    return new ImageResponse(
      ogCard({
        eyebrow: "LIVESHORTLY SESSION",
        title: s.title?.trim() || "Untitled session",
        subtitle: `@${s.owner_handle}${s.model ? ` · ${s.model}` : ""}`,
        status: s.status,
        stats: [
          { label: "EVENTS", value: String(s.event_count ?? 0) },
          { label: "VIEWS", value: String(s.view_count ?? 0) },
        ],
      }),
      { ...OG_SIZE },
    );
  } catch {
    // Private / not-found → generic brand card.
    return new ImageResponse(
      ogCard({
        eyebrow: "LIVESHORTLY",
        title: "A live coding session",
        subtitle: "liveshortly.com",
      }),
      { ...OG_SIZE },
    );
  }
}
