"use client";

import { useEffect, useMemo, useState } from "react";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import GenAvatar from "@/components/Avatar";
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
import { fmtBytes, fmtInt } from "@/lib/utils";

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

      {/* Quota usage — REAL, from GET /api/me */}
      {user && user.storage_limit_bytes != null && (
        <>
          <div style={{ height: 16 }} />
          <UsageMeter user={user} />
        </>
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

/** Storage + live-session usage against the caller's quota (from /api/me). An
 *  exempt account shows no caps. Bars turn red as usage nears the limit. */
function UsageMeter({ user }: { user: Me }) {
  const used = user.storage_bytes_used ?? 0;
  const limit = user.storage_limit_bytes ?? 0;
  const live = user.live_sessions ?? 0;
  const maxLive = user.max_live_sessions ?? 0;
  const exempt = !!user.quota_exempt;

  return (
    <PanelBox title="▤ USAGE & QUOTA" pad>
      {exempt ? (
        <div className="label" style={{ color: "var(--amber)" }}>
          ∞ UNLIMITED — this account is exempt from storage and session limits.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Meter
            label="Storage"
            value={fmtBytes(used)}
            limitLabel={fmtBytes(limit)}
            pct={limit > 0 ? (used / limit) * 100 : 0}
          />
          <Meter
            label="Live sessions"
            value={fmtInt(live)}
            limitLabel={fmtInt(maxLive)}
            pct={maxLive > 0 ? (live / maxLive) * 100 : 0}
          />
        </div>
      )}
    </PanelBox>
  );
}

function Meter({
  label,
  value,
  limitLabel,
  pct,
}: {
  label: string;
  value: string;
  limitLabel: string;
  pct: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const tone =
    pct >= 100 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ flex: "1 1 220px", minWidth: 180 }}>
      <div
        className="label"
        style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
      >
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span className="tnum" style={{ color: "var(--ink)" }}>
          {value}
          <span style={{ color: "var(--faint)" }}> / {limitLabel}</span>
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 6,
          background: "var(--hairline)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${clamped}%`, height: "100%", background: tone }} />
      </div>
    </div>
  );
}

function Avatar({ user, handle }: { user: Me | null; handle: string | null }) {
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
    <GenAvatar
      seed={user?.id ?? handle ?? user?.name}
      size={64}
      title={user?.name ?? handle ?? "Account"}
    />
  );
}
