"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  adminStats,
  me as fetchMe,
  type AdminStats,
} from "@/lib/api";
import { fmtInt } from "@/lib/utils";

/**
 * Super-admin-only application stats. Access is gated at three layers; this is
 * the web layer: we resolve the identity and redirect non-admins away. The
 * ADMIN nav tab is hidden for everyone else, and the API returns 403 — so a
 * non-admin who guesses the route still sees nothing (redirected + no data).
 *
 * Shows aggregate/rollup metrics only — never any user's private session content.
 */
export default function AdminPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "ok" | "denied">("checking");
  const [data, setData] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const m = await fetchMe(ctrl.signal);
        if (!m.authenticated || !m.is_admin) {
          setPhase("denied");
          router.replace("/");
          return;
        }
        setPhase("ok");
        const s = await adminStats(ctrl.signal);
        setData(s);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
          setPhase("denied");
          router.replace("/");
          return;
        }
        setErr("Could not load admin stats.");
      }
    })();
    return () => ctrl.abort();
  }, [router]);

  if (phase !== "ok") {
    return (
      <div className="label" style={{ color: "var(--muted)", padding: "40px 0" }}>
        {phase === "denied" ? "REDIRECTING…" : "CHECKING ACCESS"}
        <span className="blink">_</span>
      </div>
    );
  }

  // Each tile drills into a detailed view (users directory / filtered session
  // browser) so admins can see who's who and what's live/public.
  const tiles: {
    label: string;
    value: number;
    hint?: string;
    href?: string;
  }[] = data
    ? [
        { label: "Total Users", value: data.total_users, href: "/admin/users" },
        { label: "Active Owners", value: data.active_owners, hint: "own ≥1 session", href: "/admin/users" },
        { label: "Total Sessions", value: data.total_sessions, href: "/admin/sessions" },
        { label: "Live Now", value: data.live_now, href: "/admin/sessions?filter=live" },
        { label: "Ended", value: data.ended, href: "/admin/sessions?filter=ended" },
        { label: "Published", value: data.published, hint: "in the feed", href: "/admin/sessions?filter=public" },
        { label: "Publicly Viewable", value: data.publicly_viewable, hint: "link / public / open", href: "/admin/sessions?filter=public" },
        { label: "Total Events", value: data.total_events, href: "/admin/sessions" },
        { label: "Total Views", value: data.total_views, href: "/admin/sessions" },
        { label: "Sessions · 24h", value: data.sessions_last_24h, href: "/admin/sessions" },
        { label: "Sessions · 7d", value: data.sessions_last_7d, href: "/admin/sessions" },
      ]
    : [];

  return (
    <div>
      {/* Admin banner — distinct accent so it's obvious you're in admin mode */}
      <div
        style={{
          border: "1px solid var(--admin)",
          borderLeft: "4px solid var(--admin)",
          background: "var(--panel)",
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <div className="label" style={{ color: "var(--admin)" }}>
          ★ ADMIN · APPLICATION STATS
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          Aggregate metrics across all accounts. This surface never exposes any
          user&apos;s private session content — counts and rollups only.
        </div>
      </div>

      {err && (
        <div className="label" style={{ color: "var(--red)", marginBottom: 14 }}>
          ⚠ {err}
        </div>
      )}

      {!data && !err ? (
        <div className="label" style={{ color: "var(--muted)" }}>
          LOADING STATS<span className="blink">_</span>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          {tiles.map((t) => {
            const body = (
              <>
                <div
                  className="tnum"
                  style={{ fontSize: 30, fontWeight: 700, color: "var(--ink)" }}
                >
                  {fmtInt(t.value)}
                </div>
                <div className="label" style={{ marginTop: 6, color: "var(--ink)" }}>
                  {t.label}
                </div>
                <div
                  className="label"
                  style={{ marginTop: 3, color: "var(--faint)" }}
                >
                  {t.hint ?? (t.href ? "view details →" : " ")}
                </div>
              </>
            );
            const style: React.CSSProperties = {
              display: "block",
              border: "1px solid var(--hairline)",
              borderTop: "3px solid var(--admin)",
              background: "var(--panel)",
              padding: "16px 16px 14px",
            };
            return t.href ? (
              <Link key={t.label} href={t.href} className="lift" style={style}>
                {body}
              </Link>
            ) : (
              <div key={t.label} style={style}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
