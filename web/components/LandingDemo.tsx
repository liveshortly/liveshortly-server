"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A self-contained, auto-playing "demo player" for the landing hero. It tells
 * the whole LiveShortly story in a looping ASCII animation, no video asset:
 *   1. run `live claude` in the terminal
 *   2. a shareable URL is generated
 *   3. open that same URL in the browser — the session streams live
 *   4. a viewer talks back — the message is injected into the session
 * Pure state machine + CSS transitions (zoom cross-fade between the terminal and
 * the browser). Themed via CSS vars so it works in light and dark. Play/pause
 * + a scrubber give it the feel of a little video.
 */

const CMD = "live claude";
const URL = "liveshortly.com/s/lucid-cobra-6110";
const CHAT = "add rate limiting";

type Scene = "terminal" | "browser";

export default function LandingDemo() {
  const [scene, setScene] = useState<Scene>("terminal");
  const [cmd, setCmd] = useState("");
  const [termOut, setTermOut] = useState(0); // terminal output lines revealed
  const [events, setEvents] = useState(0); // browser event rows revealed
  const [chat, setChat] = useState("");
  const [inject, setInject] = useState(false);
  const [caption, setCaption] = useState("run `live claude` in your terminal");
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const aliveRef = useRef(true);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    aliveRef.current = true;
    // Respect reduced-motion: start paused (still fully readable at step 1).
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPaused(true);
      }
    } catch {
      /* ignore */
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const wait = async (ms: number) => {
      let left = ms;
      while (left > 0 && aliveRef.current) {
        while (pausedRef.current && aliveRef.current) await sleep(90);
        const step = Math.min(45, left);
        await sleep(step);
        left -= step;
      }
    };

    async function loop() {
      while (aliveRef.current) {
        // reset
        setScene("terminal");
        setCmd("");
        setTermOut(0);
        setEvents(0);
        setChat("");
        setInject(false);
        setCaption("run `live claude` in your terminal");
        setProgress(0.02);
        await wait(700);

        // 1 — type the command
        for (const ch of CMD) {
          if (!aliveRef.current) return;
          setCmd((c) => c + ch);
          await wait(72);
        }
        setProgress(0.14);
        await wait(520);

        // 2 — starting session + URL
        setCaption("a shareable URL is generated");
        for (let i = 1; i <= 4; i++) {
          setTermOut(i);
          setProgress(0.14 + 0.18 * (i / 4));
          await wait(i === 3 ? 620 : 460);
        }
        await wait(1000);

        // 3 — open the same URL in the browser; stream events
        setCaption("open the URL — watch it live");
        setScene("browser");
        setProgress(0.42);
        await wait(760);
        for (let i = 1; i <= 3; i++) {
          setEvents(i);
          setProgress(0.42 + 0.3 * (i / 3));
          await wait(720);
        }
        await wait(700);

        // 4 — a viewer talks back
        setCaption("viewers talk back — steer the session");
        for (const ch of CHAT) {
          if (!aliveRef.current) return;
          setChat((c) => c + ch);
          await wait(52);
        }
        setProgress(0.82);
        await wait(900);

        // …and it's injected into the running session
        setCaption("the message is injected into the session");
        setScene("terminal");
        setInject(true);
        setProgress(0.96);
        await wait(1900);
        setProgress(1);
        await wait(500);
      }
    }

    loop();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const typingCmd = cmd.length < CMD.length;

  return (
    <div
      style={{
        border: "1px solid var(--strong)",
        background: "var(--panel)",
        boxShadow: "6px 6px 0 var(--shadow)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Player top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <Dot c="var(--red)" />
        <Dot c="var(--amber)" />
        <Dot c="var(--green)" />
        <span className="label" style={{ marginLeft: 6, color: "var(--muted)" }}>
          LIVESHORTLY · HOW IT WORKS
        </span>
        <span
          className="label"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--green)",
          }}
        >
          <span className="live-dot" /> DEMO
        </span>
      </div>

      {/* Stage — two cross-fading/zooming scenes */}
      <div
        style={{
          position: "relative",
          background: "var(--bg)",
          height: 320,
          overflow: "hidden",
        }}
      >
        {/* Terminal scene */}
        <Stage active={scene === "terminal"} zoomFrom="down">
          <MiniBar label="zsh — ~/myapp" />
          <div style={{ padding: "12px 14px", fontSize: 12.5, lineHeight: 1.75 }}>
            <div>
              <span style={{ color: "var(--muted)" }}>~/myapp</span>{" "}
              <span style={{ color: "var(--green)" }}>$</span> {cmd}
              {typingCmd && <Cursor />}
            </div>
            {termOut >= 1 && (
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                ◐ live · starting session…
              </div>
            )}
            {termOut >= 2 && (
              <div style={{ color: "var(--ink)" }}>
                ● capturing <span style={{ color: "var(--amber)" }}>claude code</span>{" "}
                <span style={{ color: "var(--faint)" }}>· pty</span>
              </div>
            )}
            {termOut >= 3 && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: "var(--green)" }}>▸ LIVE</span>
                <span
                  style={{
                    border: "1px solid var(--green)",
                    color: "var(--green)",
                    padding: "2px 8px",
                    background: "color-mix(in srgb, var(--green) 10%, var(--bg))",
                  }}
                >
                  {URL}
                </span>
              </div>
            )}
            {termOut >= 4 && (
              <div style={{ color: "var(--faint)", marginTop: 6 }}>
                ▸ share the link — anyone can watch, live
              </div>
            )}
            {inject && (
              <div style={{ color: "var(--amber)", marginTop: 10 }}>
                ↳ viewer: {CHAT}{" "}
                <span style={{ color: "var(--faint)" }}>· injected into context</span>
                <Cursor />
              </div>
            )}
          </div>
        </Stage>

        {/* Browser scene */}
        <Stage active={scene === "browser"} zoomFrom="up">
          {/* fake browser chrome + URL bar (the SAME url) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--hairline)",
              background: "var(--panel)",
            }}
          >
            <Dot c="var(--faint)" />
            <Dot c="var(--faint)" />
            <div
              className="tnum"
              style={{
                flex: 1,
                border: "1px solid var(--hairline)",
                background: "var(--bg)",
                color: "var(--muted)",
                padding: "3px 10px",
                fontSize: 11,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              🔒 {URL}
            </div>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div className="label" style={{ display: "flex", gap: 8, color: "var(--muted)" }}>
              <span style={{ color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="live-dot" /> LIVE
              </span>
              lucid-cobra-6110 · claude-opus-4-8
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {events >= 1 && (
                <Bubble accent="var(--amber)" label="YOU">
                  build the JWT auth middleware
                </Bubble>
              )}
              {events >= 2 && (
                <div
                  className="tnum"
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    paddingLeft: 4,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "var(--red)" }}>✎</span> Wrote{" "}
                  <span style={{ color: "var(--ink)" }}>api/authn.go</span>{" "}
                  <span style={{ color: "var(--faint)" }}>+187</span>
                </div>
              )}
              {events >= 3 && (
                <Bubble accent="var(--green)" label="◆ CLAUDE">
                  Done — all tests pass.
                </Bubble>
              )}
              {chat && (
                <div
                  style={{
                    marginTop: 2,
                    border: "1px solid var(--amber)",
                    background: "color-mix(in srgb, var(--amber) 8%, var(--panel))",
                    padding: "6px 9px",
                    fontSize: 12.5,
                    color: "var(--ink)",
                  }}
                >
                  <span className="label" style={{ color: "var(--amber)" }}>
                    ✉ @viewer
                  </span>{" "}
                  {chat}
                  <Cursor />
                </div>
              )}
            </div>
          </div>
        </Stage>
      </div>

      {/* Controls: play/pause · caption · scrubber */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderTop: "1px solid var(--hairline)",
        }}
      >
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play demo" : "Pause demo"}
          className="label"
          style={{
            border: "1px solid var(--strong)",
            background: "transparent",
            color: "var(--ink)",
            width: 26,
            height: 26,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <span
          className="label"
          style={{
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {caption}
        </span>
        <div
          style={{
            width: 90,
            height: 4,
            background: "var(--hairline)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              background: "var(--green)",
              transition: "width 0.45s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stage({
  active,
  zoomFrom,
  children,
}: {
  active: boolean;
  zoomFrom: "up" | "down";
  children: React.ReactNode;
}) {
  const restScale = zoomFrom === "up" ? 1.06 : 0.95;
  return (
    <div
      aria-hidden={!active}
      style={{
        position: "absolute",
        inset: 0,
        opacity: active ? 1 : 0,
        transform: `scale(${active ? 1 : restScale})`,
        transition: "opacity 520ms ease, transform 520ms ease",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

function MiniBar({ label }: { label: string }) {
  return (
    <div
      className="label"
      style={{
        padding: "7px 12px",
        borderBottom: "1px solid var(--hairline)",
        color: "var(--faint)",
        background: "var(--panel)",
      }}
    >
      {label}
    </div>
  );
}

function Bubble({
  accent,
  label,
  children,
}: {
  accent: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        background: `color-mix(in srgb, ${accent} 7%, var(--panel))`,
        padding: "6px 10px",
        fontSize: 12.5,
        color: "var(--ink)",
      }}
    >
      <div className="label" style={{ color: accent, fontSize: 9, marginBottom: 2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Cursor() {
  return (
    <span
      className="blink"
      style={{
        display: "inline-block",
        width: 7,
        height: 14,
        background: "var(--green)",
        marginLeft: 2,
        transform: "translateY(2px)",
      }}
    />
  );
}

function Dot({ c }: { c: string }) {
  return (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: 9999,
        background: c,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
