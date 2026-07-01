"use client";

import { useEffect, useMemo, useState } from "react";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import SessionCard from "@/components/SessionCard";
import {
  PanelBox,
  PlaceholderNote,
  PreviewBanner,
  Stat,
} from "@/components/preview";
import {
  isPublished,
  listSessions,
  me as fetchMe,
  type Me,
  type Session,
} from "@/lib/api";
import { fmtInt } from "@/lib/utils";

/**
 * Developer profile. Real data where the backend has it (identity, the user's
 * own sessions, and an activity heatmap derived from real session timestamps);
 * the richer mockup panels (language DNA, traits, regulars, code archaeology,
 * tool usage) have no backend yet and render honest placeholders.
 */
export default function ProfilePage() {
  const [user, setUser] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [m, list] = await Promise.all([
          fetchMe(ctrl.signal),
          listSessions({ scope: "mine", status: "all", limit: 100 }, ctrl.signal),
        ]);
        setUser(m);
        setSessions(list.results);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setErr("Could not load your profile.");
      }
    })();
    return () => ctrl.abort();
  }, []);

  const handle = sessions?.[0]?.owner_handle ?? null;
  const stats = useMemo(() => {
    const s = sessions ?? [];
    return {
      total: s.length,
      published: s.filter(isPublished).length,
      live: s.filter((x) => x.status === "live").length,
      events: s.reduce((n, x) => n + (x.event_count ?? 0), 0),
    };
  }, [sessions]);

  const dates = useMemo(
    () => (sessions ?? []).map((s) => s.created_at),
    [sessions],
  );
  const published = useMemo(
    () => (sessions ?? []).filter(isPublished),
    [sessions],
  );

  return (
    <div>
      {/* whoami card */}
      <PanelBox title="⌂ WHOAMI" pad>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Avatar user={user} handle={handle} />
          <div style={{ minWidth: 0, flex: "1 1 220px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
              {user?.name ?? handle ?? "—"}
            </div>
            <div className="label" style={{ color: "var(--muted)", marginTop: 4 }}>
              {handle ? `@${handle}` : "—"}
              {user?.email && (
                <>
                  <span style={{ color: "var(--hairline)" }}> · </span>
                  {user.email}
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <Stat label="Sessions" value={sessions ? fmtInt(stats.total) : "··"} />
            <Stat label="Published" value={sessions ? fmtInt(stats.published) : "··"} />
            <Stat label="Live" value={sessions ? fmtInt(stats.live) : "··"} />
            <Stat label="Events" value={sessions ? fmtInt(stats.events) : "··"} />
          </div>
        </div>
      </PanelBox>

      {err && (
        <div className="label" style={{ color: "var(--red)", margin: "14px 0" }}>
          ⚠ {err}
        </div>
      )}

      {/* Activity heatmap — REAL, derived from session timestamps */}
      <div style={{ height: 16 }} />
      <PanelBox title="▦ SESSION ACTIVITY">
        {sessions == null ? (
          <PlaceholderNote label="LOADING…" />
        ) : (
          <ActivityHeatmap dates={dates} />
        )}
      </PanelBox>

      {/* Two-column placeholder panels for the not-yet-backed mockup sections */}
      <div style={{ height: 16 }} />
      <PreviewBanner>
        the panels below are part of the new design; their data isn&apos;t
        captured yet
      </PreviewBanner>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <PanelBox title="◧ LANGUAGE DNA">
          <PlaceholderNote>
            Per-language breakdown of the code you touch — needs file-level
            capture.
          </PlaceholderNote>
        </PanelBox>
        <PanelBox title="✦ DEVELOPER TRAITS">
          <PlaceholderNote>
            Night Owl · Test-First · Deep Focus — derived once session timing and
            tool usage are analysed.
          </PlaceholderNote>
        </PanelBox>
        <PanelBox title="◎ REGULARS">
          <PlaceholderNote>
            Viewers who show up most across your streams.
          </PlaceholderNote>
        </PanelBox>
        <PanelBox title="✉ INJECT SPOTLIGHT">
          <PlaceholderNote>
            Viewer comments that changed the course of a session.
          </PlaceholderNote>
        </PanelBox>
        <PanelBox title="⛏ CODE ARCHAEOLOGY">
          <PlaceholderNote>Your most-touched files and paths.</PlaceholderNote>
        </PanelBox>
        <PanelBox title="⚙ TOOL USAGE">
          <PlaceholderNote>
            Breakdown of Claude tool calls across your sessions.
          </PlaceholderNote>
        </PanelBox>
      </div>

      {/* Published sessions — REAL */}
      <div style={{ height: 20 }} />
      <div
        className="label dashed-b"
        style={{ paddingBottom: 8, marginBottom: 12, color: "var(--ink)" }}
      >
        ▣ PUBLISHED SESSIONS
        {sessions && (
          <span className="tnum" style={{ color: "var(--muted)" }}>
            {" "}
            · {fmtInt(published.length)}
          </span>
        )}
      </div>
      {sessions == null ? (
        <PlaceholderNote label="LOADING…" />
      ) : published.length === 0 ? (
        <PlaceholderNote label="NOTHING PUBLISHED YET">
          Publish a session from your HUD and it will appear here and on the feed.
        </PlaceholderNote>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))",
            gap: 14,
          }}
        >
          {published.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ user, handle }: { user: Me | null; handle: string | null }) {
  const initial = (user?.name ?? handle ?? "?").slice(0, 1).toUpperCase();
  if (user?.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt=""
        width={64}
        height={64}
        style={{
          width: 64,
          height: 64,
          border: "1px solid var(--hairline)",
          objectFit: "cover",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 64,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--strong)",
        color: "var(--panel)",
        fontSize: 26,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>
  );
}
