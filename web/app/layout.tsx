import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import ThemeProvider, { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveShortly",
  description: "Live agent & coding sessions — terminal HUD.",
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
