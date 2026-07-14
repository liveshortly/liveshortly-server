"use client";

import Feed from "@/components/Feed";

/** /feed — full browse/search feed. Reached by anonymous guests directly and
 *  by authenticated users via the topbar search or "See all" links. */
export default function FeedRoute() {
  return <Feed />;
}
