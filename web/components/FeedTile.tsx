"use client";

import Link from "next/link";
import Badge from "@/components/Badge";
import type { Session } from "@/lib/api";
import { fmtInt, tileBg, timeAgo } from "@/lib/utils";

/**
 * A single rectangular feed tile — a synthesized, on-theme "thumbnail" for a
 * published session (no image): status + model, title, a hero snippet preview,
 * and a footer of owner · age · views. The whole tile links to the read-only
 * session view. Architected so a generated thumbnail image can drop in later.
 */
export default function FeedTile({ session }: { session: Session }) {
  const model = session.model ?? "—";
  return (
    <Link
      href={`/session/${session.id}`}
      className="feed-tile lift"
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--hairline)",
        background: tileBg(session.status),
        minHeight: 188,
        overflow: "hidden",
      }}
    >
      {/* Header strip — status + model, like a tiny "channel" row. */}
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
          title={model}
          style={{
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {model}
        </span>
      </div>

      {/* Body — title + hero snippet. */}
      <div style={{ padding: "11px 11px 9px", flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.3,
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

      {/* Footer — owner · age · stats. */}
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
        <span>{timeAgo(session.published_at ?? session.created_at)}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <span title="events">⚙ {fmtInt(session.event_count)}</span>
          <span title="views">◔ {fmtInt(session.view_count)}</span>
        </span>
      </div>
    </Link>
  );
}
