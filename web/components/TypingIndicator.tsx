"use client";

/**
 * Themed "is typing" indicator — a monospace label with three bouncing dots and
 * a blinking block caret, matching the terminal-HUD aesthetic. Used for both
 * "Claude is working" (derived from live stream state) and "@viewer is typing"
 * (ephemeral presence over SSE).
 */
export default function TypingIndicator({
  label,
  tone = "green",
}: {
  label: string;
  tone?: "green" | "amber";
}) {
  const color = tone === "amber" ? "var(--amber)" : "var(--green)";
  return (
    <div
      className="label"
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color,
        padding: "6px 10px",
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, var(--panel))`,
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: "0.08em" }}>{label}</span>
      <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
        <Dot color={color} delay="0ms" />
        <Dot color={color} delay="160ms" />
        <Dot color={color} delay="320ms" />
      </span>
      <span
        aria-hidden
        className="ls-caret"
        style={{
          width: 7,
          height: 13,
          background: color,
          display: "inline-block",
        }}
      />
      <style>{`
        @keyframes ls-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes ls-caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .ls-caret { animation: ls-caret-blink 1s step-end infinite; }
      `}</style>
    </div>
  );
}

function Dot({ color, delay }: { color: string; delay: string }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 1,
        background: color,
        display: "inline-block",
        animation: "ls-typing-bounce 1.1s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}
