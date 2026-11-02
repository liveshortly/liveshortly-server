"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MARGIN = 12; // min gap from viewport edges
const GAP = 6; // gap between anchor and popover

type Pos = { top: number; left: number };

/**
 * A small anchored popover rendered in a portal with fixed positioning, so it
 * escapes any `overflow` clip on its ancestors (e.g. the sessions table) and is
 * never cut off. It right-aligns to the anchor, stays inside the viewport, flips
 * above when there's no room below, and repositions on scroll / resize.
 *
 * Dismisses on outside-click (excluding the anchor, so the trigger button can
 * toggle), on Escape and when focus leaves it. Focus moves in on open and back
 * to the anchor on close, since the portal sits at the end of the document.
 */
export default function Popover({
  anchorEl,
  onClose,
  width = 340,
  ariaLabel,
  children,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  width?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    ref.current?.focus();
    const el = ref.current;
    return () => {
      // Closed while focus was inside (Escape, a link, ✕): hand it back.
      if (!document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement))
        anchorEl?.focus();
    };
  }, [mounted, anchorEl]);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const place = () => {
      const a = anchorEl.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const left = Math.max(
        MARGIN,
        Math.min(a.right - width, vw - width - MARGIN),
      );

      const roomBelow = vh - a.bottom - GAP;
      const roomAbove = a.top - GAP;
      const below = roomBelow >= h || roomBelow >= roomAbove;
      const top = below
        ? Math.min(a.bottom + GAP, vh - h - MARGIN)
        : Math.max(MARGIN, a.top - GAP - h);

      setPos({ top, left });
    };
    place();
    // Recompute when content height may have changed.
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorEl, width]);

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

  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !ref.current?.contains(to) && !anchorEl?.contains(to)) onClose();
      }}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex: 250,
        width,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
        border: "1px solid var(--strong)",
        background: "var(--panel2)",
        padding: 12,
        textAlign: "left",
        cursor: "default",
        boxShadow: "0 8px 26px var(--shadow)",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Shared header row for popovers: a label title and a ✕ close button. */
export function PopoverHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
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
      <span>{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="label"
        style={{
          minWidth: 24, // WCAG 2.5.8 target size
          minHeight: 24,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--muted)",
        }}
      >
        ✕
      </button>
    </div>
  );
}
