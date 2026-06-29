import type { Metadata, Viewport } from "next";
import AuthGate from "@/components/AuthGate";
import ThemeProvider, { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveShortly",
  description: "Live agent & coding sessions — terminal HUD.",
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
