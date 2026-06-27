"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Clock from "@/components/Clock";
import Panel from "@/components/Panel";
import { stats as fetchStats, type Stats } from "@/lib/api";
import { fmtInt } from "@/lib/utils";

/** Top HUD bar: wordmark, live status + UTC clock, and two stat panels. */
export default function HudHeader() {
  const [data, setData] = useState<Stats | null>(null);
  const [ok, setOk] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await fetchStats();
        if (alive) {
          setData(s);
          setOk(true);
        }
      } catch {
        if (alive) setOk(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const liveNow = data?.live_now ?? 0;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--strong)",
        background: "var(--panel)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "stretch",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Wordmark + status */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: "1 1 240px",
            minWidth: 220,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            <span
              aria-hidden
              style={{
                border: "1px solid var(--strong)",
                padding: "1px 6px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              LS
            </span>
            LiveShortly
            <span className="blink" style={{ color: "var(--muted)" }}>
              _
            </span>
          </Link>
          <div
            className="label"
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: ok ? "var(--muted)" : "var(--red)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: liveNow > 0 ? "var(--green)" : "var(--muted)",
              }}
            >
              {liveNow > 0 ? (
                <span className="live-dot" />
              ) : (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    background: "var(--faint)",
                    display: "inline-block",
                  }}
                />
              )}
              {liveNow > 0 ? "LIVE" : "IDLE"}
            </span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <Clock />
            {!ok && (
              <>
                <span style={{ color: "var(--hairline)" }}>·</span>
                <span style={{ color: "var(--red)" }}>API OFFLINE</span>
              </>
            )}
          </div>
        </div>

        {/* Stat panels */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
            gap: 12,
            flex: "1 1 320px",
          }}
        >
          <Panel
            label="Total Sessions"
            value={data ? fmtInt(data.total_sessions) : "··"}
          />
          <Panel
            label="Live Now"
            value={data ? fmtInt(data.live_now) : "··"}
            accent={liveNow > 0 ? "green" : "ink"}
          />
        </div>
      </div>
    </header>
  );
}
