"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { loginUrl } from "@/lib/api";

function LoginInner() {
  const params = useSearchParams();
  const failed = params.has("auth_error");

  const signIn = () => {
    // Full-page navigation — NOT fetch — so Google OAuth can run.
    window.location.href = loginUrl();
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid var(--strong)",
          background: "var(--panel)",
          padding: "28px 26px",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            <span aria-hidden style={{ color: "var(--green)" }}>
              ◧
            </span>
            LiveShortly
            <span className="blink" style={{ color: "var(--muted)" }}>
              _
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div
          className="label"
          style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.5 }}
        >
          LIVE AGENT &amp; CODING SESSIONS · SIGN IN TO VIEW THE FEED
        </div>

        <div
          className="dashed-b"
          style={{ height: 1, margin: "20px 0" }}
          aria-hidden
        />

        <button
          type="button"
          onClick={signIn}
          className="label"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            border: "1px solid var(--green)",
            background: "var(--green)",
            color: "var(--panel)",
            padding: "13px 16px",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: "0.1em",
          }}
        >
          <GoogleMark />
          SIGN IN WITH GOOGLE
        </button>

        {failed && (
          <div
            className="label"
            style={{ marginTop: 12, color: "var(--red)" }}
          >
            ⚠ SIGN-IN FAILED — TRY AGAIN
          </div>
        )}

        <div
          className="label"
          style={{ marginTop: 18, color: "var(--faint)", fontSize: 10 }}
        >
          AUTH · GOOGLE OAUTH · COOKIE SESSION
        </div>
      </div>
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
      }}
    >
      G
    </span>
  );
}

/** Full-screen terminal-HUD login gate. */
export default function LoginScreen() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100dvh",
            background: "var(--bg)",
          }}
        />
      }
    >
      <LoginInner />
    </Suspense>
  );
}
