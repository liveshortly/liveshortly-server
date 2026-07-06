"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import InstallCommand from "@/components/InstallCommand";
import ThemeToggle from "@/components/ThemeToggle";
import { loginUrl } from "@/lib/api";

const FEATURES: [string, string, string][] = [
  [
    "◉",
    "LIVE",
    "Stream a Claude Code session as it runs — every prompt, tool call and diff, in real time.",
  ],
  [
    "↺",
    "REPLAYABLE",
    "Every session is captured. Come back later and replay the whole thing event-by-event.",
  ],
  [
    "⊕",
    "SHAREABLE",
    "Send a private link, share with specific people, or publish to the public feed.",
  ],
];

function LandingInner() {
  const params = useSearchParams();
  const failed = params.has("auth_error");

  const signIn = () => {
    // Full-page navigation — NOT fetch — so Google OAuth can run.
    window.location.href = loginUrl();
  };

  return (
    <div>
      <LandingHeader onSignIn={signIn} />

      <main className="app-main">
        {failed && (
          <div
            className="label"
            style={{
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "10px 14px",
              marginBottom: 18,
            }}
          >
            ⚠ SIGN-IN FAILED — TRY AGAIN
          </div>
        )}

        <Hero onSignIn={signIn} />
        <HowItWorks />
        <Features />
      </main>
    </div>
  );
}

/** Full-page landing view for anonymous visitors: product pitch, sign-in/
 *  sign-up CTAs, and the real public feed underneath. */
export default function Landing() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)" }} />}>
      <LandingInner />
    </Suspense>
  );
}

function LandingHeader({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--strong)",
        background: "var(--panel)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <BrandMark />
          LiveShortly
          <span className="blink" style={{ color: "var(--muted)" }}>
            _
          </span>
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignIn}
            className="label"
            style={{
              border: "1px solid var(--strong)",
              background: "transparent",
              color: "var(--ink)",
              padding: "7px 14px",
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            SIGN IN
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section
      style={{
        border: "1px solid var(--strong)",
        background: "var(--panel)",
        padding: "clamp(24px, 5vw, 44px) clamp(18px, 5vw, 32px)",
        marginTop: 24,
        marginBottom: 8,
      }}
    >
      <div className="label" style={{ color: "var(--green)" }}>
        ◉ LIVESHORTLY
      </div>
      <h1
        style={{
          fontSize: "clamp(26px, 5vw, 40px)",
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
          margin: "14px 0 0",
          color: "var(--ink)",
          maxWidth: 720,
        }}
      >
        Watch Claude Code write software — live.
      </h1>
      <p
        style={{
          margin: "14px 0 0",
          color: "var(--muted)",
          fontSize: "clamp(13px, 2.4vw, 15px)",
          lineHeight: 1.6,
          maxWidth: 620,
        }}
      >
        LiveShortly turns any Claude Code session into a live-streamed,
        replayable, shareable feed. Viewers watch every prompt and tool call
        as it happens — and can talk back to a running session in real time.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 24,
        }}
      >
        <button
          type="button"
          onClick={onSignIn}
          className="label"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid var(--green)",
            background: "var(--green)",
            color: "var(--panel)",
            padding: "13px 20px",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: "0.1em",
          }}
        >
          <GoogleMark />
          GET STARTED — SIGN UP FREE
        </button>
        <span className="label" style={{ color: "var(--faint)" }}>
          free · sign in with Google
        </span>
      </div>
    </section>
  );
}

/** The concrete getting-started flow with the new `live` CLI: install → run →
 *  share. Steps 1–2 carry the real, copyable commands; step 3 shows the reach. */
function HowItWorks() {
  return (
    <section style={{ marginTop: 20 }}>
      <div
        className="label dashed-b"
        style={{ color: "var(--ink)", paddingBottom: 8, marginBottom: 14 }}
      >
        ⌥ HOW IT WORKS · THREE STEPS
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {/* 01 — install */}
        <Step
          n="01"
          title="INSTALL LIVE"
          body="One command drops the live CLI onto your PATH. Idempotent — rerun any time to update."
        >
          <InstallCommand command="curl -fsSL https://liveshortly.com/install.sh | bash" />
          <Link
            href="/install"
            className="label"
            style={{ color: "var(--muted)", marginTop: 10, display: "inline-block" }}
          >
            all versions →
          </Link>
        </Step>

        {/* 02 — run */}
        <Step
          n="02"
          title="RUN LIVE CLAUDE"
          body="live wraps Claude Code and opens a session, printing your share URL the moment it starts streaming."
        >
          <InstallCommand command="live claude" />
          <div
            className="label tnum"
            style={{ color: "var(--green)", marginTop: 10 }}
          >
            ▸ streaming · liveshortly.com/session/…
          </div>
        </Step>

        {/* 03 — share / publish */}
        <Step
          n="03"
          title="SHARE OR PUBLISH"
          body="Open the URL to watch live from the browser, send a private link to a teammate, or publish it to the public feed."
        >
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}
          >
            {["PRIVATE LINK", "PUBLIC FEED", "OPEN · NO LOGIN"].map((c) => (
              <span
                key={c}
                className="label"
                style={{
                  border: "1px solid var(--hairline)",
                  color: "var(--muted)",
                  padding: "4px 9px",
                  fontSize: 9,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </Step>
      </div>
    </section>
  );
}

/** One numbered step card in the terminal-HUD style. */
function Step({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "16px 16px 18px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          className="tnum"
          style={{ color: "var(--green)", fontSize: 22, fontWeight: 700 }}
        >
          {n}
        </span>
        <span className="label" style={{ color: "var(--ink)", fontWeight: 700 }}>
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "var(--muted)",
          margin: "8px 0 12px",
          flex: 1,
        }}
      >
        {body}
      </div>
      {children}
    </div>
  );
}

function Features() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
        marginTop: 20,
      }}
    >
      {FEATURES.map(([glyph, title, desc]) => (
        <div
          key={title}
          style={{
            border: "1px solid var(--hairline)",
            background: "var(--panel)",
            padding: "16px 16px 18px",
          }}
        >
          <div
            aria-hidden
            style={{ color: "var(--green)", fontSize: 18, lineHeight: 1 }}
          >
            {glyph}
          </div>
          <div
            className="label"
            style={{ fontWeight: 700, marginTop: 10, color: "var(--ink)" }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "var(--muted)",
              marginTop: 6,
            }}
          >
            {desc}
          </div>
        </div>
      ))}
    </div>
  );
}

function GoogleMark() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        background: "var(--panel)",
        color: "var(--green)",
        fontWeight: 700,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      G
    </span>
  );
}

