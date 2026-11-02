import Link from "next/link";
import Avatar from "@/components/Avatar";
import StatusBadge from "@/components/ui/StatusBadge";
import { sessionTitle, type Session } from "@/lib/api";
import { fmtInt, frameworkLabel, timeAgo } from "@/lib/utils";
import s from "./FeedCard.module.css";

/**
 * The one public feed card (LSW-14) — /feed, the landing page and the home
 * feed all render this. Title, a 2-line summary (the server-redacted hero
 * snippet), agent + model chip, author, duration · events · views · age.
 */
export default function FeedCard({ session }: { session: Session }) {
  const live = session.status === "live";
  // Prompt-derived when never renamed — redacted server-side like the title.
  const title = sessionTitle(session);
  // Auto-named sessions fall back to the title as their hero — don't repeat it.
  const summary = session.hero && session.hero !== session.title && session.hero !== title ? session.hero : null;
  const agent = frameworkLabel(session.framework);
  const dur = duration(session);
  return (
    <Link href={`/session/${session.id}`} className={s.card}>
      <div className={s.chips}>
        {live && <StatusBadge status="live" />}
        {(agent !== "—" || session.model) && (
          <span className={s.chip} title={session.model ?? undefined}>
            {[agent !== "—" ? agent : null, session.model].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      <h3 className={s.title} title={title}>
        {title}
      </h3>
      {summary && <p className={s.summary}>{summary}</p>}
      <div className={s.foot}>
        <span className={s.author}>
          <Avatar seed={session.owner_handle} size={20} />
          <span>@{session.owner_handle}</span>
        </span>
        <span className={`${s.stats} tnum`}>
          {[
            dur,
            `${fmtInt(session.event_count)} events`,
            `${fmtInt(session.view_count)} views`,
            timeAgo(session.published_at ?? session.created_at),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </Link>
  );
}

/** "42m" / "3h 5m" for an ended session; null while live or unknown. */
function duration(session: Session): string | null {
  if (!session.ended_at) return null;
  const mins = Math.round(
    (new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 60000,
  );
  if (!(mins >= 1)) return null;
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
