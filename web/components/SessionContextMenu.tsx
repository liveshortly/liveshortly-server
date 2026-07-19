"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HandoffButton from "@/components/HandoffButton";
import ShareToTwitter from "@/components/ShareToTwitter";
import PublishAction from "@/components/PublishAction";
import DeleteSessionButton from "@/components/DeleteSessionButton";
import ShareDialog from "@/components/ShareDialog";
import { type Session } from "@/lib/api";

/**
 * Right-click context menu for a sidebar session row. Reuses the same action
 * components as the session-viewer row / mobile sheet, scoped to this session.
 * Owner rows get the full set; non-owned (shared-with-me) rows get just the
 * viewer-safe actions (Open, Continue/Fork, Share to X).
 */
export default function SessionContextMenu({
  session,
  isOwner,
  x,
  y,
  onClose,
  onChanged,
  onDeleted,
}: {
  session: Session;
  isOwner: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onChanged: (u: Session) => void;
  onDeleted: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pos, setPos] = useState({ x, y });

  // Clamp into the viewport once measured.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (x + r.width > window.innerWidth - 8) nx = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight - 8) ny = window.innerHeight - r.height - 8;
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  // Dismiss on outside-click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);


  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
    >
      <div className="ctx-title" title={session.title}>
        {session.title || "untitled session"}
      </div>

      <Link
        href={`/session/${session.id}`}
        className="ctx-item"
        role="menuitem"
        onClick={onClose}
      >
        ↗ Open
      </Link>

      <div className="ctx-sep" />

      <div className="ctx-row">
        <HandoffButton sessionId={session.id} />
      </div>
      {isOwner && (
        <div className="ctx-row ctx-pop">
          <button
            ref={shareBtnRef}
            type="button"
            className={`ctx-actbtn${shareOpen ? " on" : ""}`}
            onClick={() => setShareOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={shareOpen}
          >
            ◉ Share…
          </button>
          {shareOpen && (
            <ShareDialog
              sessionId={session.id}
              title={session.title}
              anchorEl={shareBtnRef.current}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
      <div className="ctx-row">
        <ShareToTwitter session={session} onChanged={onChanged} />
      </div>

      {isOwner && (
        <>
          <div className="ctx-row">
            <PublishAction session={session} onChanged={onChanged} />
          </div>
          <div className="ctx-sep" />
          <div className="ctx-row">
            <DeleteSessionButton
              id={session.id}
              onDeleted={() => {
                onDeleted();
                onClose();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
