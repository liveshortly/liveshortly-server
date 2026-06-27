"use client";

import { useEffect, useRef, useState } from "react";
import {
  createShare,
  deleteShare,
  listShares,
  type ShareGrant,
  type ShareRole,
} from "@/lib/api";

/**
 * Owner-only sharing popover for a session: add a grant by email + role,
 * and list/revoke existing grants. Closes on outside click / Esc.
 */
export default function ShareDialog({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [grants, setGrants] = useState<ShareGrant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Outside-click + Esc to close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Load existing grants.
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await listShares(sessionId, ctrl.signal);
        if (alive) setGrants(r.results ?? []);
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError") {
          setGrants([]);
          setErr("Could not load shares.");
        }
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [sessionId]);

  const add = async () => {
    const addr = email.trim();
    if (!addr || busy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      setErr("Enter a valid email.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const grant = await createShare(sessionId, addr, role);
      setGrants((g) => {
        const rest = (g ?? []).filter(
          (x) => x.grantee_email.toLowerCase() !== addr.toLowerCase(),
        );
        return [grant, ...rest];
      });
      setEmail("");
    } catch (e) {
      setErr(
        (e as Error & { status?: number }).status === 403
          ? "Only the owner can share this session."
          : "Could not add — try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: ShareGrant) => {
    setErr(null);
    const prev = grants;
    setGrants((cur) => (cur ?? []).filter((x) => x.id !== g.id));
    try {
      await deleteShare(sessionId, g.id);
    } catch {
      setGrants(prev ?? null);
      setErr("Could not remove — try again.");
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Share session"
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 6px)",
        zIndex: 50,
        width: 320,
        border: "1px solid var(--strong)",
        background: "var(--panel)",
        padding: 12,
        textAlign: "left",
        cursor: "default",
        boxShadow: "3px 3px 0 var(--hairline)",
      }}
    >
      <div
        className="label dashed-b"
        style={{
          paddingBottom: 6,
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>SHARE SESSION</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="label"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--faint)",
          }}
        >
          ✕
        </button>
      </div>

      {title && (
        <div
          className="label"
          style={{
            color: "var(--muted)",
            marginBottom: 10,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textTransform: "none",
            letterSpacing: 0,
          }}
          title={title}
        >
          {title}
        </div>
      )}

      {/* Add row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="EMAIL"
          aria-label="Grantee email"
          spellCheck={false}
          autoComplete="off"
          className="label"
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid var(--hairline)",
            background: "var(--bg)",
            color: "var(--ink)",
            padding: "8px 8px",
            fontSize: 11,
            outline: "none",
          }}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ShareRole)}
          aria-label="Role"
          className="label"
          style={{
            border: "1px solid var(--hairline)",
            background: "var(--bg)",
            color: "var(--ink)",
            padding: "0 6px",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          <option value="viewer">VIEWER</option>
          <option value="commenter">COMMENTER</option>
        </select>
        <button
          type="button"
          onClick={add}
          disabled={busy || email.trim().length === 0}
          className="label"
          style={{
            border: "1px solid var(--strong)",
            background: "var(--strong)",
            color: "var(--panel)",
            padding: "0 10px",
            fontSize: 10,
            cursor: busy || !email.trim() ? "default" : "pointer",
            opacity: !email.trim() ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "ADD"}
        </button>
      </div>

      {err && (
        <div className="label" style={{ color: "var(--red)", marginBottom: 8 }}>
          ⚠ {err}
        </div>
      )}

      {/* Existing grants */}
      <div style={{ marginTop: 4 }}>
        {grants == null ? (
          <div className="label" style={{ color: "var(--muted)" }}>
            LOADING…
          </div>
        ) : grants.length === 0 ? (
          <div className="label" style={{ color: "var(--faint)" }}>
            NOT SHARED WITH ANYONE YET.
          </div>
        ) : (
          grants.map((g) => (
            <div
              key={g.id}
              className="dashed-b"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 0",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
                title={g.grantee_email}
              >
                {g.grantee_email}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="label"
                  style={{ color: "var(--amber)", fontSize: 10 }}
                >
                  {g.role}
                </span>
                <button
                  type="button"
                  onClick={() => remove(g)}
                  aria-label={`Remove ${g.grantee_email}`}
                  className="label"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--red)",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
