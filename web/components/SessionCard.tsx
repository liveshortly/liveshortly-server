"use client";

import Link from "next/link";
import Badge from "@/components/Badge";
import type { Session } from "@/lib/api";
import { fmtInt, shortId, timeAgo } from "@/lib/utils";

/**
 * A dashboard session card — the card-grid counterpart to a SessionTable row.
 * Header (status + model), title + short id, optional hero snippet, a meta
 * footer (events · views · age), tags, and an optional action row (publish /
 * share for owned sessions) or access badge (for shared sessions).
 *
 * The card body links to the session; the action row is outside the link so
 * its buttons don't trigger navigation.
 */
export default function SessionCard({
  session,
  actions,
  accessRole,
}: {
  session: Session;
  /** Owner action row (publish + share), rendered below the card body. */
  actions?: React.ReactNode;
  /** For shared sessions: the caller's granted role, shown as a badge. */
  accessRole?: string | null;
}) {
  return (
    <div
      className="lift"
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        minHeight: 172,
      }}
    >
      <Link
        href={`/session/${session.id}`}
        style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}
      >
        {/* Header strip — status + model */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "9px 11px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <Badge status={session.status} />
          <span
            className="label tnum"
            title={session.model ?? undefined}
            style={{
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {session.model ?? "—"}
          </span>
        </div>

        {/* Body — short id, title, hero snippet, tags */}
        <div style={{ padding: "11px 11px 9px", flex: 1, minWidth: 0 }}>
          <div className="label" style={{ color: "var(--faint)" }}>
            {shortId(session.id)}
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.3,
              marginTop: 3,
              color: "var(--ink)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={session.title}
          >
            {session.title || "untitled session"}
          </div>
          {session.hero && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--muted)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <span style={{ color: "var(--green)" }}>›</span> {session.hero}
            </div>
          )}
          {session.tags && session.tags.length > 0 && (
            <div
              className="label"
              style={{
                marginTop: 8,
                color: "var(--faint)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              #{session.tags.slice(0, 4).join("  #")}
            </div>
          )}
        </div>

        {/* Meta footer — owner · age · stats */}
        <div
          className="label tnum"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 11px",
            borderTop: "1px solid var(--hairline)",
            color: "var(--muted)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 120,
            }}
          >
            @{session.owner_handle}
          </span>
          <span style={{ color: "var(--hairline)" }}>·</span>
          <span>{timeAgo(session.ended_at ?? session.created_at)}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            <span title="events">⚙ {fmtInt(session.event_count)}</span>
            <span title="views">◔ {fmtInt(session.view_count)}</span>
          </span>
        </div>
      </Link>

      {/* Action row / access badge — outside the link */}
      {actions ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "8px 11px",
            borderTop: "1px solid var(--hairline)",
          }}
        >
          {actions}
        </div>
      ) : accessRole ? (
        <div
          className="label"
          style={{
            padding: "8px 11px",
            borderTop: "1px solid var(--hairline)",
            color: "var(--muted)",
          }}
        >
          🔗 shared · {accessRole}
        </div>
      ) : null}
    </div>
  );
}
