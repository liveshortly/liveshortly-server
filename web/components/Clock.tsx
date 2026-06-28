"use client";

import { useEffect, useState } from "react";
import { localClock, tzAbbrev } from "@/lib/utils";

/** Live clock in the viewer's LOCAL timezone — ticks every second. */
export default function Clock() {
  // Start null to avoid SSR/CSR hydration mismatch, then fill on mount.
  const [now, setNow] = useState<string | null>(null);
  const [tz, setTz] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(localClock());
    tick();
    setTz(tzAbbrev());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="tnum" suppressHydrationWarning>
      {now ?? "--:--:--"}
      <span className="label" style={{ marginLeft: 6 }}>
        {tz || "LOCAL"}
      </span>
    </span>
  );
}
