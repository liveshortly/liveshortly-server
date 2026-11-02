"use client";

import { useEffect } from "react";

const REPORT_URL = "https://github.com/liveshortly/liveshortly-server/issues/new";

/** Error boundary for every route segment (renders inside the shell, so the
 *  header stays usable): what happened, Retry, and a way to report it. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "80px 16px",
      }}
    >
      <div
        style={{
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "32px",
          maxWidth: 540,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div className="label" style={{ color: "var(--red)" }}>
          ◦ ERROR
        </div>
        <h1 style={{ fontSize: 18, color: "var(--ink)", margin: "12px 0 0" }}>
          Something went wrong loading this page
        </h1>
        {error.digest && (
          <p className="label" style={{ color: "var(--muted)", marginTop: 10 }}>
            ref {error.digest}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={reset}
            className="label"
            style={{
              border: "1px solid var(--strong)",
              background: "var(--strong)",
              color: "var(--panel)",
              padding: "10px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ↻ RETRY
          </button>
          <a
            href={REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="label"
            style={{
              border: "1px solid var(--hairline)",
              color: "var(--ink)",
              padding: "10px 16px",
            }}
          >
            REPORT A PROBLEM
          </a>
        </div>
      </div>
    </div>
  );
}
