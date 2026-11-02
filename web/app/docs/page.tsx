import type { Metadata } from "next";
import Link from "next/link";
import { loadAll } from "./docs";
import s from "./docs.module.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How to install the live CLI, stream and share agent sessions, approve tool runs, start sessions from the web, and run your own LiveShortly server.",
  alternates: { canonical: `${SITE_URL}/docs` },
};

export default function DocsIndex() {
  return (
    <article className={s.content}>
      <h1 className={s.title}>LiveShortly docs</h1>
      <p className={s.lead}>
        LiveShortly streams a coding agent&apos;s session to a web page while it runs. People
        you share it with can watch, send the agent messages, and approve its tool runs. When
        the session ends, the page becomes a replay. New here? Start with{" "}
        <Link href="/docs/getting-started">Getting started</Link>.
      </p>
      <ol className={s.index}>
        {loadAll().map((d) => (
          <li key={d.slug}>
            <h2>
              <Link href={`/docs/${d.slug}`}>{d.title}</Link>
            </h2>
            <p>{d.summary}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
