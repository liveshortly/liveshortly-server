import { JBM_400_B64, JBM_700_B64 } from "@/lib/fonts/jetbrainsMono";

/**
 * JetBrains Mono (the app's UI font) for next/og ImageResponse, so generated
 * cards match the terminal-HUD theme. The TTFs are base64-embedded in a TS
 * module (see jetbrainsMono.ts) so they are always bundled — including in the
 * standalone prod output — and work regardless of runtime (no fs/fetch).
 */
type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let cache: OgFont[] | null = null;

export function ogFonts(): OgFont[] {
  if (!cache) {
    cache = [
      {
        name: "JetBrains Mono",
        data: Buffer.from(JBM_400_B64, "base64"),
        weight: 400,
        style: "normal",
      },
      {
        name: "JetBrains Mono",
        data: Buffer.from(JBM_700_B64, "base64"),
        weight: 700,
        style: "normal",
      },
    ];
  }
  return cache;
}
