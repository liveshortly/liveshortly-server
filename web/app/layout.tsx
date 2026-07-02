import type { Metadata, Viewport } from "next";
import AuthGate from "@/components/AuthGate";
import ThemeProvider, { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

/** Absolute base for OG/canonical URLs (override per-deploy via env). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://liveshortly.com";
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
    { media: "(prefers-color-scheme: light)", color: "#e7e8ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2123" },
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
      <body>
        <ThemeProvider>
          <AuthGate>{children}</AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
