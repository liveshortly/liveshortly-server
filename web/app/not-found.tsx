import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata: Metadata = { title: "Page not found" };

/** 404 in the terminal-HUD tone (renders inside the app shell / guest header,
 *  signed in or out, with HTTP 404). */
export default function NotFound() {
  return <NotFoundView title="This page doesn't exist" />;
}

export function NotFoundView({ title }: { title: string }) {
  const link = {
    border: "1px solid var(--hairline)",
    color: "var(--ink)",
    padding: "10px 16px",
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "40px 16px",
      }}
    >
      <div
        style={{
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "40px 32px",
          maxWidth: 540,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <BrandMark />
        </div>
        <div className="label" style={{ color: "var(--red)" }}>
          ◦ ERROR · 404
        </div>
        <div
          className="tnum"
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--ink)",
            margin: "14px 0 0",
          }}
        >
          4<span style={{ color: "var(--green)" }}>0</span>4
        </div>
        <h1 style={{ fontSize: 18, color: "var(--ink)", margin: "14px 0 0" }}>
          {title}
        </h1>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 24,
          }}
        >
          <Link
            href="/"
            className="label"
            style={{
              border: "1px solid var(--strong)",
              background: "var(--strong)",
              color: "var(--panel)",
              padding: "10px 16px",
              fontWeight: 700,
            }}
          >
            ⌂ HOME
          </Link>
          <Link href="/feed" className="label" style={link}>
            FEED
          </Link>
          <Link href="/docs" className="label" style={link}>
            DOCS
          </Link>
        </div>
      </div>
    </div>
  );
}
