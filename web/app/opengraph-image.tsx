import { ImageResponse } from "next/og";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE, SITE_CARD } from "@/lib/ogCard";
import { ogFonts } from "@/lib/ogFonts";

// Default site card (landing/feed + any page without its own).
export const alt = "LiveShortly — stream your coding agent sessions";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(ogCard(SITE_CARD), { ...OG_SIZE, fonts: ogFonts() });
}
