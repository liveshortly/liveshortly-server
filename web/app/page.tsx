import Landing from "@/components/Landing";
import { getFeed, getLiveFeed, publicStats } from "@/lib/api";

/** The landing, rendered on the server with the public feed already in it.
 *  Signed-in visitors never get here: middleware sends them to /sessions.
 *  The fetches are cookieless server calls, so only public data is used. */
export default async function Page() {
  const signal = AbortSignal.timeout(3000); // a slow API must not blank the landing
  const [live, recent, stats] = await Promise.allSettled([
    getLiveFeed(12, signal),
    getFeed({ limit: 24 }, signal),
    publicStats(signal),
  ]);
  return (
    <Landing
      initial={{
        live: live.status === "fulfilled" ? live.value.results : [],
        recent: recent.status === "fulfilled" ? recent.value.results : [],
        stats: stats.status === "fulfilled" ? stats.value : null,
      }}
    />
  );
}
