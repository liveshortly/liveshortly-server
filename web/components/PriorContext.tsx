"use client";

import { useState } from "react";

import EventStream from "@/components/EventStream";
import { getLineage, type ForkRef, type Lineage } from "@/lib/api";

/**
 * PriorContext renders the source session's history for a fork — the virtual
 * full-history view (approach B). It's a distinct, collapsible block ABOVE the
 * fork's own EVENT LOG: the source keeps its own `seq` numbering (each session
 * numbers from 1), so it must never be merged into the fork's seq-sorted feed.
 *
 * Lazily fetches /lineage on first expand so a normal fork page load stays cheap.
 */
export default function PriorContext({
  id,
  source,
}: {
  id: string;
  source: ForkRef;
}) {
  const [open, setOpen] = useState(false);
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !lineage && !loading) {
      setLoading(true);
      setErr(null);
      try {
        setLineage(await getLineage(id));
      } catch {
        setErr("could not load prior context");
      } finally {
        setLoading(false);
      }
    }
  };

  const count = lineage?.events.length ?? 0;

  return (
    <section className="prior-context">
      <button
        type="button"
        className="label prior-context-head"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          padding: "6px 12px",
          color: "var(--muted)",
        }}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>
          PRIOR CONTEXT — FORKED FROM{" "}
          {source.owner_handle ? `@${source.owner_handle}` : "a session"}
          {source.title ? ` · ${source.title}` : ""}
        </span>
        {lineage && !lineage.restricted && (
          <span style={{ marginLeft: "auto" }}>
            {count} EVENT{count === 1 ? "" : "S"} · @seq {source.seq}
          </span>
        )}
      </button>

      {open && (
        <div className="prior-context-body">
          {loading && (
            <div className="label" style={{ padding: "6px 12px", color: "var(--muted)" }}>
              loading prior context…
            </div>
          )}
          {err && (
            <div className="label" style={{ padding: "6px 12px", color: "var(--red)" }}>
              {err}
            </div>
          )}
          {lineage?.restricted && (
            <div className="label" style={{ padding: "6px 12px", color: "var(--muted)" }}>
              you don&apos;t have access to the source session&apos;s history
            </div>
          )}
          {lineage && !lineage.restricted && count === 0 && !loading && (
            <div className="label" style={{ padding: "6px 12px", color: "var(--muted)" }}>
              no prior events
            </div>
          )}
          {lineage && !lineage.restricted && count > 0 && (
            <EventStream
              events={lineage.events}
              live={false}
              ownerHandle={source.owner_handle ?? null}
            />
          )}
        </div>
      )}
    </section>
  );
}
