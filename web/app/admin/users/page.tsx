"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminUsers, setUserQuota, type AdminUser } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { fmtBytes, fmtInt, timeAgo } from "@/lib/utils";

/** Admin user directory — who the users are, when they last logged in / were
 *  active, and how many sessions they own. Aggregate/identity only. */
export default function AdminUsersPage() {
  const phase = useAdminGuard();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const patchUser = (id: string, next: Partial<AdminUser>) =>
    setUsers((cur) =>
      cur ? cur.map((u) => (u.id === id ? { ...u, ...next } : u)) : cur,
    );

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
                <Th hideSm>Last active</Th>
                <Th align="right">Sessions</Th>
                <Th align="right">Live</Th>
                <Th>Storage</Th>
                <Th>Quota</Th>
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
                      {u.email || `@${u.handle}`}
                    </div>
                  </Td>
                  <Td hideSm mono>{u.last_active_at ? timeAgo(u.last_active_at) : "—"}</Td>
                  <Td align="right" mono>
                    {fmtInt(u.session_count)}
                  </Td>
                  <Td align="right" mono>
                    <span style={{ color: u.live_count > 0 ? "var(--green)" : "var(--muted)" }}>
                      {u.live_count > 0 ? `● ${fmtInt(u.live_count)}` : "0"}
                    </span>
                  </Td>
                  <Td>
                    <StorageCell user={u} />
                  </Td>
                  <Td>
                    <QuotaControls user={u} onChange={(n) => patchUser(u.id, n)} />
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

/** A used/limit storage bar. Exempt users show no cap (unlimited). */
function StorageCell({ user }: { user: AdminUser }) {
  const { storage_bytes_used: used, storage_limit_bytes: limit, quota_exempt } = user;
  const pct = quota_exempt || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);
  const over = !quota_exempt && used >= limit;
  return (
    <div style={{ minWidth: 130 }}>
      <div className="tnum" style={{ fontSize: 12, color: "var(--ink)" }}>
        {fmtBytes(used)}
        <span style={{ color: "var(--faint)" }}>
          {" / "}
          {quota_exempt ? "∞" : fmtBytes(limit)}
        </span>
      </div>
      {!quota_exempt && (
        <div
          style={{
            marginTop: 4,
            height: 4,
            background: "var(--hairline)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: over ? "var(--red)" : "var(--green)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Inline per-user quota editor: storage cap (MB) + max live sessions, plus a
 *  Remove-limits toggle that sets quota_exempt. Optimistic — the parent list is
 *  updated from the server's resolved usage on save. */
function QuotaControls({
  user,
  onChange,
}: {
  user: AdminUser;
  onChange: (next: Partial<AdminUser>) => void;
}) {
  const MB = 1024 * 1024;
  const [editing, setEditing] = useState(false);
  const [storageMb, setStorageMb] = useState(
    String(Math.round(user.storage_limit_bytes / MB)),
  );
  const [maxLive, setMaxLive] = useState(String(user.max_live_sessions));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const save = async (body: Parameters<typeof setUserQuota>[1]) => {
    setBusy(true);
    setErr(false);
    try {
      const r = await setUserQuota(user.id, body);
      onChange({
        storage_bytes_used: r.storage_bytes_used,
        storage_limit_bytes: r.storage_limit_bytes,
        max_live_sessions: r.max_live_sessions,
        quota_exempt: r.quota_exempt,
      });
      setEditing(false);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  if (user.quota_exempt) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="label" style={{ color: "var(--amber)" }}>
          ∞ UNLIMITED
        </span>
        <SmallBtn onClick={() => save({ quota_exempt: false })} disabled={busy}>
          Enforce
        </SmallBtn>
      </div>
    );
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="label tnum" style={{ color: "var(--muted)" }}>
          {maxLive} live max
        </span>
        <SmallBtn onClick={() => setEditing(true)}>Edit</SmallBtn>
        <SmallBtn onClick={() => save({ quota_exempt: true })} disabled={busy}>
          Remove limits
        </SmallBtn>
        {err && <span className="label" style={{ color: "var(--red)" }}>⚠</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <QuotaInput value={storageMb} onChange={setStorageMb} unit="MB" width={64} />
      <QuotaInput value={maxLive} onChange={setMaxLive} unit="live" width={48} />
      <SmallBtn
        onClick={() =>
          save({
            storage_limit_bytes: Math.max(0, Math.round(Number(storageMb) || 0)) * MB,
            max_live_sessions: Math.max(0, Math.round(Number(maxLive) || 0)),
          })
        }
        disabled={busy}
        primary
      >
        {busy ? "…" : "Save"}
      </SmallBtn>
      <SmallBtn onClick={() => setEditing(false)} disabled={busy}>
        ✕
      </SmallBtn>
      {err && <span className="label" style={{ color: "var(--red)" }}>⚠</span>}
    </div>
  );
}

function QuotaInput({
  value,
  onChange,
  unit,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  width: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        aria-label={unit}
        className="tnum"
        style={{
          width,
          border: "1px solid var(--hairline)",
          background: "var(--bg)",
          color: "var(--ink)",
          padding: "3px 6px",
          fontSize: 12,
          outline: "none",
        }}
      />
      <span className="label" style={{ color: "var(--faint)" }}>
        {unit}
      </span>
    </span>
  );
}

function SmallBtn({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="label"
      style={{
        border: `1px solid ${primary ? "var(--admin)" : "var(--hairline)"}`,
        background: primary ? "var(--admin)" : "transparent",
        color: primary ? "var(--panel)" : "var(--ink)",
        padding: "3px 8px",
        fontSize: 10,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
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
