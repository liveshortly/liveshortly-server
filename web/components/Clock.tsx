"use client";

import { useEffect, useState } from "react";
import { utcClock } from "@/lib/utils";

/** Live UTC clock — ticks every second. Renders HH:MM:SS UTC. */
export default function Clock() {
  // Start null to avoid SSR/CSR hydration mismatch, then fill on mount.
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    setNow(utcClock());
    const id = setInterval(() => setNow(utcClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="tnum" suppressHydrationWarning>
      {now ?? "--:--:--"}
      <span className="label" style={{ marginLeft: 6 }}>
        UTC
      </span>
    </span>
  );
}
