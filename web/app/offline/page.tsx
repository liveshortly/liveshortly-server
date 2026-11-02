import type { Metadata } from "next";
import BrandMark from "@/components/BrandMark";
import s from "./offline.module.css";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/** Served by public/sw.js when a navigation fails with no network (LSW-19).
 *  Static, no user data: the worker caches this page and nothing private. */
export default function Offline() {
  return (
    <div className={s.wrap}>
      <BrandMark />
      <h1 className="t-title">You&rsquo;re offline</h1>
      <p className="t-body">LiveShortly needs a connection to show your sessions. Reconnect and try again.</p>
      <a className={s.retry} href="/sessions">
        Try again
      </a>
    </div>
  );
}
