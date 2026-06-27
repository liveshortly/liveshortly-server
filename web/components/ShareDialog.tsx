"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createShare,
  deleteShare,
  listShares,
  type ShareGrant,
  type ShareRole,
} from "@/lib/api";

const DIALOG_WIDTH = 340;
const MARGIN = 12; // min gap from viewport edges
const GAP = 6; // gap between anchor and dialog

type Pos = { top: number; left: number; placement: "below" | "above" };

/**
 * Owner-only sharing popover for a session: add a grant by email + role,
 * and list/revoke existing grants. Closes on outside click / Esc.
 *
 * Rendered in a portal with fixed positioning anchored to `anchorEl` so it
 * escapes the session table's `overflow` clip and never gets cut off by it.
 * Flips above the anchor when there isn't room below.
 */
export default function ShareDialog({
  sessionId,
  title,
  anchorEl,
  onClose,
}: {
  sessionId: string;
  title?: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [grants, setGrants] = useState<ShareGrant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position the dialog against the anchor; keep it in the viewport and flip
  // above when there's not enough room below. Recompute on scroll / resize.
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const place = () => {
      const a = anchorEl.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const left = Math.max(
        MARGIN,
        Math.min(a.right - DIALOG_WIDTH, vw - DIALOG_WIDTH - MARGIN),
      );

      const roomBelow = vh - a.bottom - GAP;
      const roomAbove = a.top - GAP;
      const below = roomBelow >= h || roomBelow >= roomAbove;
      const top = below
        ? Math.min(a.bottom + GAP, vh - h - MARGIN)
        : Math.max(MARGIN, a.top - GAP - h);

      setPos({ top, left, placement: below ? "below" : "above" });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorEl, grants, err]);

  // Outside-click + Esc to close. The anchor (SHARE button) is excluded so its
  // own click toggles instead of double-firing a close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
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
  }, [onClose, anchorEl]);

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

  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Share session"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex: 50,
        width: DIALOG_WIDTH,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
        border: "1px solid var(--strong)",
        background: "var(--panel)",
        padding: 12,
        textAlign: "left",
        cursor: "default",
        boxShadow: "3px 3px 0 var(--hairline)",
        visibility: pos ? "visible" : "hidden",
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
    </div>,
    document.body,
  );
}
