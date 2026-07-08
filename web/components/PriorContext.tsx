"use client";

import { useEffect, useState } from "react";

import EventStream from "@/components/EventStream";
import { getLineage, type ForkRef, type Lineage } from "@/lib/api";

/**
 * PriorContext renders the source session's history for a fork — the virtual
 * full-history view (approach B). It's a distinct block ABOVE the fork's own
 * EVENT LOG: the source keeps its own `seq` numbering (each session numbers from
 * 1), so it must never be merged into the fork's seq-sorted feed.
 *
 * On a fork the full prior history is what the operator wants to see, so it
 * loads eagerly and shows expanded by default (still collapsible).
 */
export default function PriorContext({
  id,
  source,
}: {
  id: string;
  source: ForkRef;
}) {
  const [open, setOpen] = useState(true);
  const [lineage, setLineage] = useState<Lineage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Eager-load the prior context on mount — on a fork it's the point of the page.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getLineage(id)
      .then((l) => alive && setLineage(l))
      .catch(() => alive && setErr("could not load prior context"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const toggle = () => setOpen((o) => !o);

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
