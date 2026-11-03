import { ImageResponse } from "next/og";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { ogFonts } from "@/lib/ogFonts";

// Default site card (landing/feed + any page without its own), same theme.
export const alt = "LiveShortly — stream your coding agent sessions";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    ogCard({
      shortId: "LIVESHORTLY",
      title: "Stream your coding agent sessions",
      snippet: "live · replayable · shareable",
    }),
    { ...OG_SIZE, fonts: ogFonts() },
  );
}
