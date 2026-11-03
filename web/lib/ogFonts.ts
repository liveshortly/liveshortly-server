import { INTER_400_B64, INTER_600_B64 } from "@/lib/fonts/inter";
import { JBM_400_B64 } from "@/lib/fonts/jetbrainsMono";

/**
 * Fonts for next/og ImageResponse, per the LSW-01 type rule: Inter carries the
 * card, JetBrains Mono only the code peek. The fonts are base64-embedded in TS
 * modules (lib/fonts/) so they are always bundled — including in the standalone
 * prod output — and work regardless of runtime (no fs/fetch).
 */
type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600;
  style: "normal";
};

let cache: OgFont[] | null = null;

export function ogFonts(): OgFont[] {
  if (!cache) {
    const f = (name: string, b64: string, weight: 400 | 600): OgFont => ({
      name,
      data: Buffer.from(b64, "base64"),
      weight,
      style: "normal",
    });
    cache = [
      f("Inter", INTER_400_B64, 400),
      f("Inter", INTER_600_B64, 600),
      f("JetBrains Mono", JBM_400_B64, 400),
    ];
  }
  return cache;
}
