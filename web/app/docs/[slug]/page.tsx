import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDoc, SLUGS, type Heading } from "../docs";
import Markdown from "../Markdown";
import { loadChangelog } from "@/lib/changelog";
import s from "../docs.module.css";
import { SITE_URL } from "@/lib/install";

const EDIT_BASE = "https://github.com/liveshortly/liveshortly-server/edit/main/web/content/docs";

// Every page is pre-rendered; any other slug is a 404.
export const dynamicParams = false;
export const generateStaticParams = () => SLUGS.map((slug) => ({ slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = loadDoc((await params).slug);
  if (!doc) return {};
  return {
    title: `${doc.title} · Docs`,
    description: doc.summary,
    alternates: { canonical: `${SITE_URL}/docs/${doc.slug}` },
  };
}

function Toc({ headings }: { headings: Heading[] }) {
  return (
    <ul>
      {headings.map((h) => (
        <li key={h.id} className={h.depth === 3 ? s.tocSub : undefined}>
          <a href={`#${h.id}`}>{h.text}</a>
        </li>
      ))}
    </ul>
  );
}

export default async function DocPage({ params }: Props) {
  const doc = loadDoc((await params).slug);
  if (!doc) notFound();
  const i = SLUGS.indexOf(doc.slug);
  const prev = i > 0 ? loadDoc(SLUGS[i - 1]) : null;
  const next = i < SLUGS.length - 1 ? loadDoc(SLUGS[i + 1]) : null;
  // The CLI release these docs describe (synced from the live repo at build).
  const version = loadChangelog().latest.version;
  const edit =
    doc.slug === "cli-reference"
      ? "https://github.com/liveshortly/live/edit/main/cmd/live/main.go"
      : `${EDIT_BASE}/${doc.slug}.md`;

  return (
    <>
      <article className={s.content}>
        <h1 className={s.title}>{doc.title}</h1>
        {doc.headings.length > 0 && (
          <details className={s.tocMobile}>
            <summary>On this page</summary>
            <Toc headings={doc.headings} />
          </details>
        )}
        <Markdown>{doc.body}</Markdown>
        <footer className={s.footer}>
          <a href={edit} target="_blank" rel="noopener noreferrer">
            Edit this page on GitHub
          </a>
          {version && <span className={s.version}>Written for live {version}</span>}
          <nav aria-label="Previous and next page" className={s.pager}>
            {prev && <Link href={`/docs/${prev.slug}`}>← {prev.title}</Link>}
            {next && <Link href={`/docs/${next.slug}`}>{next.title} →</Link>}
          </nav>
        </footer>
      </article>
      {doc.headings.length > 0 && (
        <aside className={s.toc} aria-label="On this page">
          <div className="label">On this page</div>
          <Toc headings={doc.headings} />
        </aside>
      )}
    </>
  );
}
