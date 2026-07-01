"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import EventStream from "@/components/EventStream";
import {
  PageHead,
  PanelBox,
  PlaceholderNote,
  PreviewBanner,
} from "@/components/preview";
import { getSession, type SessionDetail } from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

/**
 * YouTube-style replay player (design/session-video.html). The player CHROME —
 * scrubber, chapters, speed control, view modes, playlist — is preview-only:
 * the backend does not record a replay timeline yet. The event log shown inside
 * the "screen" is REAL (the session's captured events).
 */
export default function ReplayPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getSession(id, ctrl.signal)
      .then(setSession)
      .catch((e) => {
        if ((e as Error).name !== "AbortError")
          setErr("Could not load this session.");
      });
    return () => ctrl.abort();
  }, [id]);

  return (
    <div>
      <PageHead
        eyebrow="▶ REPLAY"
        title={session?.title || "session replay"}
        sub={
          session
            ? `@${session.owner_handle} · ${fmtInt(session.event_count)} events · ${
                session.status === "ended"
                  ? `ended ${timeAgo(session.ended_at)}`
                  : `started ${timeAgo(session.created_at)}`
              }`
            : undefined
        }
        back={{ href: `/session/${id}`, label: "BACK TO SESSION" }}
      />

      <PreviewBanner>
        scrubber, chapters &amp; speed are design preview — the live event log
        below is real
      </PreviewBanner>

      {err ? (
        <div className="label" style={{ color: "var(--red)" }}>
          ⚠ {err}
        </div>
      ) : (
        <>
          {/* The "screen" — real events, laid out as the player viewport */}
          <div
            style={{
              border: "1px solid var(--strong)",
              background: "var(--bg)",
              maxHeight: 460,
              overflowY: "auto",
              padding: "12px 12px 0",
            }}
          >
            {session == null ? (
              <div className="label" style={{ color: "var(--muted)", padding: 20 }}>
                LOADING REPLAY<span className="blink">_</span>
              </div>
            ) : (
              <EventStream
                events={session.events}
                live={false}
                ownerHandle={session.owner_handle}
              />
            )}
          </div>

          {/* Transport / scrubber — preview chrome */}
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderTop: "none",
              background: "var(--panel)",
              padding: "12px 14px",
            }}
          >
            <div
              aria-hidden
              style={{
                height: 6,
                background: "var(--hairline)",
                position: "relative",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "0%",
                  background: "var(--green)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <TransportBtn>▶</TransportBtn>
              <span className="label tnum" style={{ color: "var(--faint)" }}>
                00:00 / --:--
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {["0.5×", "1×", "2×", "4×"].map((s, i) => (
                  <Chip key={s} active={i === 1}>
                    {s}
                  </Chip>
                ))}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                {["SPLIT", "CODE", "EVENTS", "DIFF"].map((s, i) => (
                  <Chip key={s} active={i === 2}>
                    {s}
                  </Chip>
                ))}
              </span>
            </div>
          </div>

          {/* Chapters + playlist placeholders */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              marginTop: 16,
            }}
          >
            <PanelBox title="⚑ CHAPTERS">
              <PlaceholderNote>
                Auto-chaptered from the event stream once replay timing is
                captured.
              </PlaceholderNote>
            </PanelBox>
            <PanelBox title="≡ UP NEXT">
              <PlaceholderNote>
                Autoplay playlist of related sessions.
              </PlaceholderNote>
            </PanelBox>
          </div>
        </>
      )}
    </div>
  );
}

function TransportBtn({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="label"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        border: "1px solid var(--strong)",
        color: "var(--ink)",
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className="label"
      style={{
        padding: "5px 9px",
        fontSize: 10,
        border: "1px solid var(--hairline)",
        color: active ? "var(--green)" : "var(--muted)",
        background: active ? "var(--bg)" : "transparent",
      }}
    >
      {children}
    </span>
  );
}
