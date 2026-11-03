import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadChangelog, type Release } from "@/lib/changelog";
import { ScrollPre } from "@/components/ui/CodeBlock";
import s from "./changelog.module.css";
import { SITE_URL } from "@/lib/install";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every release of the live CLI and the LiveShortly web app and server, newest first.",
  alternates: { canonical: `${SITE_URL}/changelog` },
};

// Generated from content/changelog/*.md at build time (see scripts/sync-changelogs.mjs).
export const dynamic = "force-static";

function Md({ children }: { children: string }) {
  return (
    <div className={`md ${s.md}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ScrollPre }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

// Section headings sit one level under the release heading (h2 latest, h3 timeline).
function Body({ r, h: H = "h4" }: { r: Release; h?: "h3" | "h4" }) {
  return (
    <>
      {r.intro && <Md>{r.intro}</Md>}
      {r.sections.map((sec, i) => (
        <section key={i} className={s.group}>
          <H className="label">{sec.title}</H>
          {sec.body && <Md>{sec.body}</Md>}
        </section>
      ))}
    </>
  );
}

export default function ChangelogPage() {
  const { latest, releases } = loadChangelog();

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div className="label">Changelog</div>
        <h1>What&apos;s new in LiveShortly</h1>
      </header>

      <section className={s.latest} aria-labelledby="latest-heading">
        <div className="label">Latest</div>
        <h2 id="latest-heading">
          live {latest.version} · <time dateTime={latest.date}>{latest.date}</time>
        </h2>
        <p className={s.upgrade}>
          Upgrade with <code>live update</code> or{" "}
          <code>brew upgrade liveshortly/tap/live</code>.
        </p>
        <Body r={latest} h="h3" />
        <a href={`#${latest.id}`} className="label">
          Jump to {latest.version} in the timeline ▾
        </a>
      </section>

      <ol className={s.timeline}>
        {releases.map((r) => (
          <li key={r.id} id={r.id} className={s.entry}>
            <div className={s.meta}>
              <span className={`label ${s.component}`}>{r.component}</span>
              <h3>
                <a href={`#${r.id}`}>{r.version ?? r.title ?? r.date}</a>
              </h3>
              <time className="label tnum" dateTime={r.date}>
                {r.date}
              </time>
            </div>
            <div className={s.content}>
              {r.version && r.title && <p>{r.title}</p>}
              <Body r={r} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
