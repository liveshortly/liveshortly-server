"use client";

/**
 * Themed "is typing" indicator — a monospace label with three dots that wave in
 * sequence, matching the terminal-HUD aesthetic. Used for both "Claude is
 * working" (derived from live stream state) and "@viewer is typing" (ephemeral
 * presence over SSE).
 *
 * The wider surface is deliberately near-static (no idle pulses/blinks), but the
 * typing indicator is the one exception: the dots animate while it's shown. Its
 * whole job is to say "something is happening right now", so the motion IS the
 * signal — and it's already gated behind a real state change (it mounts only
 * while Claude/a viewer is actually working). `prefers-reduced-motion` still
 * neutralises it globally in globals.css for viewers who opt out.
 */
export default function TypingIndicator({
  label,
  tone = "green",
  variant = "chip",
}: {
  label: string;
  tone?: "green" | "amber";
  /**
   * "chip" — the bordered/tinted pill (desktop stream-pane + viewer-typing).
   * "inline" — the light, borderless line from design/session-viewer-mobile.html
   * (`.typing-indicator`): dots-then-label, ~9.5px, indented under the avatar
   * column so it reads as the last item in the mobile thread.
   */
  variant?: "chip" | "inline";
}) {
  const color = tone === "amber" ? "var(--amber)" : "var(--green)";
  const keyframes = (
    <style>{`
      @keyframes ls-typing-wave {
        0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-2px); }
      }
    `}</style>
  );

  if (variant === "inline") {
    // Aligns with the mobile thread's message body: .mfeed-msg pads 2px +
    // 24px avatar + 9px gap = 35px (the mockup's 33px, tuned to this feed).
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          marginLeft: 35,
          marginTop: 2,
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color,
        }}
      >
        <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
          <Dot color={color} delay="0ms" inline />
          <Dot color={color} delay="150ms" inline />
          <Dot color={color} delay="300ms" inline />
        </span>
        <span style={{ fontWeight: 700 }}>{label}</span>
        {keyframes}
      </div>
    );
  }

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
        <Dot color={color} delay="150ms" />
        <Dot color={color} delay="300ms" />
      </span>
      {keyframes}
    </div>
  );
}

function Dot({
  color,
  delay,
  inline = false,
}: {
  color: string;
  delay: string;
  inline?: boolean;
}) {
  const size = inline ? 4 : 5;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: inline ? "50%" : 1,
        background: color,
        display: "inline-block",
        animation: "ls-typing-wave 1.1s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}
