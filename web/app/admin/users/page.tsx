"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminUsers, type AdminUser } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { fmtInt, timeAgo } from "@/lib/utils";

/** Admin user directory — who the users are, when they last logged in / were
 *  active, and how many sessions they own. Aggregate/identity only. */
export default function AdminUsersPage() {
  const phase = useAdminGuard();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "ok") return;
    const ctrl = new AbortController();
    adminUsers(ctrl.signal)
      .then((r) => setUsers(r.results))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setErr("Could not load users.");
      });
    return () => ctrl.abort();
  }, [phase]);

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
      <AdminHead
        title="★ USERS"
        sub={users ? `${fmtInt(users.length)} accounts` : undefined}
      />
      {err ? (
        <div className="label" style={{ color: "var(--red)" }}>
          ⚠ {err}
        </div>
      ) : !users ? (
        <div className="label" style={{ color: "var(--muted)" }}>
          LOADING USERS<span className="blink">_</span>
        </div>
      ) : users.length === 0 ? (
        <div className="label" style={{ color: "var(--muted)" }}>
          NO USERS YET.
        </div>
      ) : (
        <div className="scroll-x" style={{ border: "1px solid var(--hairline)", background: "var(--panel)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--strong)" }}>
                <Th>User</Th>
                <Th hideSm>Email</Th>
                <Th hideSm>Last login</Th>
                <Th>Last active</Th>
                <Th align="right">Sessions</Th>
                <Th align="right">Live</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <Td>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {u.name || u.handle}
                    </div>
                    <div className="label" style={{ color: "var(--faint)" }}>
                      @{u.handle}
                    </div>
                  </Td>
                  <Td hideSm>
                    <span style={{ color: "var(--muted)" }}>{u.email || "—"}</span>
                  </Td>
                  <Td hideSm mono>
                    {u.last_login_at ? timeAgo(u.last_login_at) : "never"}
                  </Td>
                  <Td mono>{u.last_active_at ? timeAgo(u.last_active_at) : "—"}</Td>
                  <Td align="right" mono>
                    {fmtInt(u.session_count)}
                  </Td>
                  <Td align="right" mono>
                    <span style={{ color: u.live_count > 0 ? "var(--green)" : "var(--muted)" }}>
                      {u.live_count > 0 ? `● ${fmtInt(u.live_count)}` : "0"}
                    </span>
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

function AdminHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Link href="/admin" className="label" style={{ color: "var(--muted)" }}>
        ◂ ADMIN
      </Link>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginTop: 10,
          borderBottom: "2px solid var(--admin)",
          paddingBottom: 8,
        }}
      >
        <h1 className="label" style={{ fontSize: 15, fontWeight: 700, color: "var(--admin)", margin: 0 }}>
          {title}
        </h1>
        {sub && (
          <span className="label" style={{ color: "var(--faint)" }}>
            {sub}
          </span>
        )}
      </div>
    </div>
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
      style={{ textAlign: align, padding: "10px 12px", verticalAlign: "top" }}
    >
      {children}
    </td>
  );
}
