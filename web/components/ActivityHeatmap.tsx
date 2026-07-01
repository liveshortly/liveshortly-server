"use client";

import { useMemo } from "react";

/**
 * A 52-week GitHub-style activity heatmap built from REAL session timestamps.
 * `dates` are ISO strings (session created_at); each cell counts sessions on
 * that day and tints from faint → green by intensity. No dummy data: an empty
 * input renders an all-empty grid.
 */
const WEEKS = 53;
const DAY_MS = 86_400_000;

export default function ActivityHeatmap({ dates }: { dates: string[] }) {
  const { grid, max, total } = useMemo(() => {
    // Bucket counts by YYYY-MM-DD (local).
    const counts = new Map<string, number>();
    for (const iso of dates) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Anchor: the most recent Saturday (end of the last column).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today.getTime() + (6 - today.getDay()) * DAY_MS);
    const start = new Date(end.getTime() - (WEEKS * 7 - 1) * DAY_MS);

    const grid: { key: string; count: number }[][] = [];
    let max = 0;
    let total = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col: { key: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        const key = dayKey(day);
        const count = day > today ? 0 : (counts.get(key) ?? 0);
        if (count > max) max = count;
        total += count;
        col.push({ key, count });
      }
      grid.push(col);
    }
    return { grid, max, total };
  }, [dates]);

  const tint = (count: number): string => {
    if (count <= 0) return "var(--hairline)";
    const t = max > 0 ? count / max : 0;
    // 0.35 → 1.0 opacity band so a single session is still visible.
    const op = (0.35 + t * 0.65).toFixed(2);
    return `color-mix(in srgb, var(--green) ${Math.round(
      Number(op) * 100,
    )}%, var(--hairline))`;
  };

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-flex", gap: 3 }}>
          {grid.map((col, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", gap: 3 }}
            >
              {col.map((cell) => (
                <div
                  key={cell.key}
                  title={`${cell.key} · ${cell.count} session${
                    cell.count === 1 ? "" : "s"
                  }`}
                  style={{
                    width: 11,
                    height: 11,
                    background: tint(cell.count),
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className="label"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          color: "var(--faint)",
        }}
      >
        <span>{total} sessions in the last year</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
          less
          {[0, 0.34, 0.67, 1].map((t, i) => (
            <span
              key={i}
              style={{
                width: 11,
                height: 11,
                borderRadius: 2,
                background:
                  t === 0
                    ? "var(--hairline)"
                    : `color-mix(in srgb, var(--green) ${Math.round(
                        (0.35 + t * 0.65) * 100,
                      )}%, var(--hairline))`,
              }}
            />
          ))}
          more
        </span>
      </div>
    </div>
  );
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
