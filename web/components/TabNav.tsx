"use client";

export type TabKey = "live" | "sessions";

/** LIVE | SESSIONS tabs plus a search input. */
export default function TabNav({
  tab,
  onTab,
  query,
  onQuery,
  liveCount,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  query: string;
  onQuery: (q: string) => void;
  liveCount?: number;
}) {
  const tabBtn = (key: TabKey, label: string, badge?: number) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => onTab(key)}
        className="label tnum"
        style={{
          background: active ? "var(--strong)" : "transparent",
          color: active ? "var(--panel)" : "var(--muted)",
          border: "1px solid var(--strong)",
          padding: "7px 14px",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
        }}
      >
        {label}
        {badge != null && badge > 0 && (
          <span
            style={{
              color: active ? "var(--bg)" : "var(--green)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              className="live-dot"
              style={{ background: active ? "var(--bg)" : "var(--green)" }}
            />
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", gap: -1 }}>
        {tabBtn("live", "Live", liveCount)}
        {tabBtn("sessions", "Sessions")}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "0 10px",
          flex: "1 1 220px",
          minWidth: 200,
          marginLeft: "auto",
        }}
      >
        <span className="label" aria-hidden>
          /
        </span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="SEARCH TITLE OR TAG"
          aria-label="Search sessions"
          spellCheck={false}
          className="label"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--ink)",
            padding: "9px 0",
            width: "100%",
            fontSize: 12,
            letterSpacing: "0.06em",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="label"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--faint)",
              fontSize: 13,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
