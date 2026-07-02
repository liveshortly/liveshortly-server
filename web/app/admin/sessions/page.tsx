"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Badge from "@/components/Badge";
import { adminSessions, type AdminSessionRow } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { fmtInt, shortId, timeAgo } from "@/lib/utils";

type Filter = "all" | "live" | "ended" | "public";
const FILTERS: Filter[] = ["all", "live", "public", "ended"];

/** Admin session browser — every session across all users, filterable by
 *  live / publicly-viewable / ended. Metadata only (no event content). */
function SessionsBrowser() {
  const phase = useAdminGuard();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("filter");
  const filter: Filter = (FILTERS as string[]).includes(raw ?? "")
    ? (raw as Filter)
    : "all";

  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "ok") return;
    const ctrl = new AbortController();
    setRows(null);
    setErr(null);
    adminSessions(filter, ctrl.signal)
      .then((r) => setRows(r.results))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setErr("Could not load sessions.");
      });
    return () => ctrl.abort();
  }, [phase, filter]);

  if (phase !== "ok") {
    return (
      <div className="label" style={{ color: "var(--muted)", padding: "40px 0" }}>
        {phase === "denied" ? "REDIRECTING…" : "CHECKING ACCESS"}
        <span className="blink">_</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Link href="/admin" className="label" style={{ color: "var(--muted)" }}>
          ◂ ADMIN
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 10,
            borderBottom: "2px solid var(--admin)",
            paddingBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <h1 className="label" style={{ fontSize: 15, fontWeight: 700, color: "var(--admin)", margin: 0 }}>
            ★ SESSIONS
          </h1>
          {rows && (
            <span className="label" style={{ color: "var(--faint)" }}>
              {fmtInt(rows.length)} shown
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() =>
                  router.replace(f === "all" ? "/admin/sessions" : `/admin/sessions?filter=${f}`, { scroll: false })
                }
                className="label"
                style={{
                  border: "1px solid var(--hairline)",
                  background: filter === f ? "var(--panel)" : "transparent",
                  color: filter === f ? "var(--admin)" : "var(--muted)",
                  borderColor: filter === f ? "var(--admin)" : "var(--hairline)",
                  padding: "5px 11px",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </span>
        </div>
      </div>

      {err ? (
        <div className="label" style={{ color: "var(--red)" }}>
          ⚠ {err}
        </div>
      ) : !rows ? (
        <div className="label" style={{ color: "var(--muted)" }}>
          LOADING SESSIONS<span className="blink">_</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="label" style={{ color: "var(--muted)" }}>
          NO SESSIONS MATCH “{filter.toUpperCase()}”.
        </div>
      ) : (
        <div className="scroll-x" style={{ border: "1px solid var(--hairline)", background: "var(--panel)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--strong)" }}>
                <Th hideSm>ID</Th>
                <Th>Title</Th>
                <Th hideSm>Owner</Th>
                <Th>Status</Th>
                <Th>Visibility</Th>
                <Th align="right">Events</Th>
                <Th align="right" hideSm>Views</Th>
                <Th align="right" hideSm>Started</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <Td hideSm mono>
                    <span style={{ color: "var(--faint)" }}>{shortId(s.id)}</span>
                  </Td>
                  <Td>
                    <Link href={`/session/${s.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {s.title || "untitled session"}
                    </Link>
                  </Td>
                  <Td hideSm>
                    <span style={{ color: "var(--muted)" }}>@{s.owner}</span>
                  </Td>
                  <Td>
                    <Badge status={s.status} />
                  </Td>
                  <Td>
                    <Visibility v={s.visibility} />
                  </Td>
                  <Td align="right" mono>
                    {fmtInt(s.event_count)}
                  </Td>
                  <Td align="right" hideSm mono>
                    {fmtInt(s.view_count)}
                  </Td>
                  <Td align="right" hideSm mono>
                    {timeAgo(s.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Visibility chip. "open" = anyone incl. signed-out; link/public need auth. */
function Visibility({ v }: { v: string }) {
  const map: Record<string, { label: string; color: string }> = {
    open: { label: "PUBLIC", color: "var(--green)" },
    public: { label: "PUBLIC*", color: "var(--green)" },
    link: { label: "LINK", color: "var(--amber)" },
    private: { label: "PRIVATE", color: "var(--faint)" },
  };
  const m = map[v] ?? { label: v.toUpperCase(), color: "var(--muted)" };
  return (
    <span className="label" style={{ color: m.color, border: `1px solid var(--hairline)`, padding: "2px 7px" }}>
      {m.label}
    </span>
  );
}

function Th({
  children,
  align = "left",
  hideSm,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  hideSm?: boolean;
}) {
  return (
    <th
      className={`label ${hideSm ? "hide-sm" : ""}`}
      style={{ textAlign: align, padding: "10px 12px", color: "var(--muted)", whiteSpace: "nowrap" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  hideSm,
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  hideSm?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`${hideSm ? "hide-sm" : ""} ${mono ? "tnum" : ""}`}
      style={{ textAlign: align, padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" }}
    >
      {children}
    </td>
  );
}

export default function AdminSessionsPage() {
  return (
    <Suspense
      fallback={
        <div className="label" style={{ color: "var(--muted)", padding: "40px 0" }}>
          LOADING<span className="blink">_</span>
        </div>
      }
    >
      <SessionsBrowser />
    </Suspense>
  );
}
