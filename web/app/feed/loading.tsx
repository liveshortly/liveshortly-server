import Skeleton from "@/components/ui/Skeleton";
import st from "@/components/Feed.module.css";

/** Shown while the server fetches the first feed page: the feed's own header,
 *  search box and card grid, so nothing jumps when it arrives. */
export default function FeedLoading() {
  return (
    <div className={st.feed} aria-busy>
      <header className={st.head}>
        <h1>Feed</h1>
        <p>Public sessions from people building with coding agents.</p>
      </header>
      <Skeleton height={44} radius={10} style={{ display: "block" }} />
      <div className={st.grid} aria-hidden style={{ marginTop: 24 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={132} radius={10} style={{ display: "block" }} />
        ))}
      </div>
    </div>
  );
}
