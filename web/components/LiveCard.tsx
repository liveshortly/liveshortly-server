"use client";

import Link from "next/link";
import Badge from "@/components/Badge";
import type { Session } from "@/lib/api";
import { fmtInt, shortId, timeAgo } from "@/lib/utils";

/** A single live session card. */
export default function LiveCard({ session }: { session: Session }) {
  return (
    <Link
      href={`/session/${session.id}`}
      style={{
        display: "block",
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: 14,
        transition: "border-color 120ms",
      }}
      className="live-card"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="label" style={{ color: "var(--faint)" }}>
            {shortId(session.id)}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={session.title}
          >
            {session.title || "untitled session"}
          </div>
        </div>
        <Badge status={session.status} />
      </div>

      <div
        className="dashed-b"
        style={{ height: 1, margin: "12px 0" }}
        aria-hidden
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        <Meta label="Owner" value={`@${session.owner_handle}`} />
        <Meta label="Model" value={session.model ?? "—"} />
        <Meta label="Events" value={fmtInt(session.event_count)} mono />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <span className="label" style={{ color: "var(--green)" }}>
          ▸ started {timeAgo(session.created_at)}
        </span>
        {session.tags && session.tags.length > 0 && (
          <span
            className="label"
            style={{
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "50%",
            }}
            title={session.tags.join(", ")}
          >
            #{session.tags.join(" #")}
          </span>
        )}
      </div>
    </Link>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label">{label}</div>
      <div
        className={mono ? "tnum" : undefined}
        style={{
          fontSize: 13,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
