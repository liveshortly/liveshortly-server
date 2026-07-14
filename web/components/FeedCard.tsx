import Link from "next/link";
import type { Session } from "@/lib/api";

/**
 * Pixel-match of designs/version3/feed.html `.card` — used only by the
 * authenticated home page's Live Now / Recently Published grids. The
 * existing FeedTile keeps its own (denser) look on /feed.
 */
export default function FeedCard({ session }: { session: Session }) {
  const live = session.status === "live";
  return (
    <Link href={`/session/${session.id}`} className="hf-card">
      <div className="hf-card-art">
        <span className={`hf-card-badge${live ? " live" : ""}`}>
          {live && <span className="live-dot" aria-hidden />}
          {live ? "Live" : "Ended"}
        </span>
        {live && <span className="hf-card-watch">▶ Watch Live</span>}
      </div>
      <div className="hf-card-body">
        <div className="hf-card-title">
          {session.title || "untitled session"}
        </div>
        <div className="hf-card-meta">
          <span className="m">@{session.owner_handle}</span>
          {session.model && (
            <>
              <span aria-hidden>·</span>
              <span>{session.model}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
