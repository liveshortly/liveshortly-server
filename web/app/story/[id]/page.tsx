"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import EventStream from "@/components/EventStream";
import {
  PageHead,
  PanelBox,
  PlaceholderNote,
  PreviewBanner,
  Stat,
} from "@/components/preview";
import Skeleton from "@/components/Skeleton";
import { getSession, type SessionDetail } from "@/lib/api";
import { fmtInt, timeAgo } from "@/lib/utils";

/**
 * "Dev Story" — the post-session blog view (design/session-report.html). The
 * narrative shell is preview-only (AI summary, auto-chapters, TOC need a
 * summarisation backend). The event timeline and the stats epilogue are REAL.
 */
export default function StoryPage() {
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

  const duration = useMemo(() => {
    if (!session) return "—";
    const start = new Date(session.created_at).getTime();
    const end = session.ended_at
      ? new Date(session.ended_at).getTime()
      : Date.now();
    const mins = Math.max(0, Math.round((end - start) / 60000));
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }, [session]);

  return (
    <div>
      <PageHead
        eyebrow="✎ DEV STORY"
        title={session?.title || "session write-up"}
        sub={
          session
            ? `@${session.owner_handle} · ${
                session.status === "ended"
                  ? `ended ${timeAgo(session.ended_at)}`
                  : "still live"
              }`
            : undefined
        }
        back={{ href: `/session/${id}`, label: "BACK TO SESSION" }}
      />

      <PreviewBanner>
        AI summary, chapters &amp; table of contents are design preview — the
        timeline &amp; stats are real
      </PreviewBanner>

      {err ? (
        <div className="label" style={{ color: "var(--red)" }}>
          ⚠ {err}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 16,
          }}
        >
          {/* AI summary — preview */}
          <PanelBox title="◆ SUMMARY">
            <PlaceholderNote label="AI SUMMARY COMING SOON">
              A generated narrative of what happened this session will appear
              here once summarisation is wired up.
            </PlaceholderNote>
          </PanelBox>

          {/* Stats epilogue — REAL */}
          <PanelBox title="▦ SESSION STATS">
            {session == null ? (
              <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} style={{ display: "grid", gap: 6 }}>
                    <Skeleton width={40} height={18} />
                    <Skeleton width={50} height={10} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
                <Stat label="Events" value={fmtInt(session.event_count)} />
                <Stat label="Views" value={fmtInt(session.view_count)} />
                <Stat label="Duration" value={duration} />
                <Stat label="Model" value={session.model ?? "—"} />
                {(session.input_tokens ?? 0) + (session.output_tokens ?? 0) >
                  0 && (
                  <Stat
                    label="Tokens in/out"
                    value={`${fmtInt(session.input_tokens ?? 0)} / ${fmtInt(
                      session.output_tokens ?? 0,
                    )}`}
                  />
                )}
              </div>
            )}
          </PanelBox>

          {/* The story body — REAL event timeline (stands in for prose chapters) */}
          <PanelBox title="≡ TIMELINE">
            {session == null ? (
              <div style={{ display: "grid", gap: 10 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} width={`${70 - i * 8}%`} height={12} />
                ))}
              </div>
            ) : session.events.length === 0 ? (
              <PlaceholderNote label="NO EVENTS CAPTURED" />
            ) : (
              <EventStream
                events={session.events}
                live={false}
                ownerHandle={session.owner_handle}
              />
            )}
          </PanelBox>

          {/* Publish CTA — preview */}
          <PanelBox title="▲ PUBLISH">
            <PlaceholderNote label="PUBLISHING THE STORY COMING SOON">
              Editing and publishing a polished write-up will live in the{" "}
              <span style={{ color: "var(--muted)" }}>Blog Composer</span>.
            </PlaceholderNote>
          </PanelBox>
        </div>
      )}
    </div>
  );
}
