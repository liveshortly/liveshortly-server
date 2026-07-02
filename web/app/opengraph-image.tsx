import { ImageResponse } from "next/og";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Default site card, used for the landing/feed and any page without its own.
export const alt = "LiveShortly — stream your Claude Code sessions";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    ogCard({
      eyebrow: "LIVESHORTLY",
      title: "Stream your Claude Code sessions",
      subtitle: "live · replayable · shareable",
    }),
    { ...OG_SIZE },
  );
}
