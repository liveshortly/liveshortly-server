import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import ThemeProvider, { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

/* v4 type system: Inter carries all reading & UI; JetBrains Mono is semantic —
   code, paths, commands, timestamps (anything that is machine truth). */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jbmono",
  display: "swap",
});

/** Absolute base for OG/canonical URLs (override per-deploy via env). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080";
const DESCRIPTION =
  "Stream your Claude Code sessions — live, replayable, shareable. A terminal-HUD feed of agent & coding sessions.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LiveShortly",
    template: "%s · LiveShortly",
  },
  description: DESCRIPTION,
  applicationName: "LiveShortly",
  openGraph: {
    type: "website",
    siteName: "LiveShortly",
    title: "LiveShortly",
    description: DESCRIPTION,
    url: SITE_URL,
    // /opengraph-image (generated below) supplies the default image.
  },
  twitter: {
    card: "summary_large_image",
    title: "LiveShortly",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the dark/light theme tint the mobile browser chrome.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F4F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1113" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the resolved theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} ${jbMono.variable}`}>
        <ThemeProvider>
          <AuthGate>{children}</AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
