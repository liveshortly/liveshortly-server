"use client";

import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import type { Session } from "@/lib/api";
import { fmtInt, shortId, timeAgo } from "@/lib/utils";

/**
 * Monospace table of all sessions.
 * Columns: ID(short) · TITLE · OWNER · MODEL · EVENTS · STATUS · OPENED
 */
export default function SessionTable({ sessions }: { sessions: Session[] }) {
  const router = useRouter();

  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        overflowX: "auto",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          minWidth: 760,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--strong)" }}>
            <Th>ID</Th>
            <Th>Title</Th>
            <Th>Owner</Th>
            <Th>Model</Th>
            <Th align="right">Events</Th>
            <Th>Status</Th>
            <Th align="right">Opened</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              onClick={() => router.push(`/session/${s.id}`)}
              className="row"
              style={{
                borderBottom: "1px dashed var(--hairline)",
                cursor: "pointer",
              }}
            >
              <Td mono faint>
                {shortId(s.id)}
              </Td>
              <Td strong title={s.title} clip>
                {s.title || "untitled session"}
              </Td>
              <Td muted>@{s.owner_handle}</Td>
              <Td muted clip title={s.model ?? ""}>
                {s.model ?? "—"}
              </Td>
              <Td mono align="right">
                {fmtInt(s.event_count)}
              </Td>
              <Td>
                <Badge status={s.status} />
              </Td>
              <Td mono muted align="right">
                {timeAgo(s.created_at)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="label"
      style={{
        textAlign: align,
        padding: "9px 12px",
        whiteSpace: "nowrap",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  muted,
  faint,
  strong,
  clip,
  align = "left",
  title,
}: {
  children: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
  faint?: boolean;
  strong?: boolean;
  clip?: boolean;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <td
      className={mono ? "tnum" : undefined}
      title={title}
      style={{
        padding: "9px 12px",
        textAlign: align,
        color: faint
          ? "var(--faint)"
          : muted
            ? "var(--muted)"
            : "var(--ink)",
        fontWeight: strong ? 600 : 400,
        whiteSpace: "nowrap",
        maxWidth: clip ? 280 : undefined,
        overflow: clip ? "hidden" : undefined,
        textOverflow: clip ? "ellipsis" : undefined,
      }}
    >
      {children}
    </td>
  );
}
