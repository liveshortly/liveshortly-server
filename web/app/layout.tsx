import type { Metadata } from "next";
import HudHeader from "@/components/HudHeader";
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
    <html lang="en">
      <body>
        <HudHeader />
        <main
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "20px 16px 56px",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
