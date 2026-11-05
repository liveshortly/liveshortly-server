import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import ThemeProvider, { themeInitScript } from "@/components/ThemeProvider";
import { loadAll } from "./docs/docs";
import "./globals.css";
import { SITE_URL } from "@/lib/install";

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

const TITLE = "LiveShortly: watch, steer and share your coding agent, live";
const DESCRIPTION =
  "Stream Claude Code, Codex, Gemini and more to a link. Teammates watch and comment live, you approve prompts from your phone, and every session replays.";
// Static, stable share image (LSW-45); /session/<id> keeps its own dynamic card.
const OG_IMAGE = { url: `${SITE_URL}/og-v2.png`, width: 1200, height: 630, alt: "LiveShortly: watch, steer and share your coding agent, live" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · LiveShortly",
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  applicationName: "LiveShortly",
  // Installed on an iPhone home screen (Web Push on iOS needs that, LSW-21).
  appleWebApp: { capable: true, title: "LiveShortly", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "LiveShortly",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the dark/light theme tint the mobile browser chrome. Mirrors --canvas
  // in app/tokens.css (metadata can't read CSS variables).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F1E9" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

const swRegisterScript = `if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})});`;

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
        {/* Installable app (LSW-19): the worker serves /offline when the network
            is gone. Production only — dev chunks aren't content-hashed. */}
        {process.env.NODE_ENV === "production" && (
          <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
        )}
      </head>
      <body className={`${inter.variable} ${jbMono.variable}`}>
        <ThemeProvider>
          <AuthGate docs={loadAll().map(({ slug, title }) => ({ slug, title }))}>
            {children}
          </AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
