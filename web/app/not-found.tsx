import Link from "next/link";

/** 404 in the terminal-HUD tone (renders inside the app shell / header). */
export default function NotFound() {
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
        <div
          className="label"
          style={{ fontSize: 13, color: "var(--ink)", marginTop: 14 }}
        >
          ROUTE NOT FOUND
        </div>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 13,
            lineHeight: 1.6,
            margin: "10px auto 0",
            maxWidth: 400,
          }}
        >
          This page doesn&apos;t exist — the session may have been deleted, or the
          link is wrong.
        </p>
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
            ◂ BACK TO FEED
          </Link>
          <Link
            href="/hud"
            className="label"
            style={{
              border: "1px solid var(--hairline)",
              color: "var(--ink)",
              padding: "10px 16px",
            }}
          >
            ⌂ MY HUD
          </Link>
        </div>
      </div>
    </div>
  );
}
