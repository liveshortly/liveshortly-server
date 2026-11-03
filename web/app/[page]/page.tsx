// Site pages (LSW-36): one markdown file per page in content/pages/<slug>.md,
// rendered with the docs' Markdown. Only the slugs below exist; anything else
// at the top level stays a 404 (dynamicParams = false).
import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import Markdown from "../docs/Markdown";
import { SITE_PAGES } from "@/lib/routes";
import docs from "../docs/docs.module.css";
import s from "./page.module.css";
import { SITE_URL } from "@/lib/install";

const EDIT_BASE = "https://github.com/liveshortly/liveshortly-server/edit/main/web/content/pages";

export const dynamicParams = false;
export const generateStaticParams = () => SITE_PAGES.map(({ slug }) => ({ page: slug }));

type Props = { params: Promise<{ page: string }> };

function load(slug: string) {
  if (!SITE_PAGES.some((p) => p.slug === slug)) return null;
  const [first, ...rest] = readFileSync(path.join(process.cwd(), "content/pages", `${slug}.md`), "utf8").split("\n");
  const body = rest.join("\n").trim();
  return { title: first.replace(/^# /, ""), body, summary: body.split("\n\n")[0].replace(/[`*_]/g, "") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  const p = load(page);
  if (!p) return {};
  return { title: p.title, description: p.summary, alternates: { canonical: `${SITE_URL}/${page}` } };
}

export default async function SitePage({ params }: Props) {
  const { page } = await params;
  const p = load(page);
  if (!p) notFound();
  return (
    <article className={`${docs.content} ${s.page}`}>
      <h1 className={docs.title}>{p.title}</h1>
      <Markdown>{p.body}</Markdown>
      <footer className={docs.footer}>
        <a href={`${EDIT_BASE}/${page}.md`} target="_blank" rel="noopener noreferrer">
          Edit this page on GitHub
        </a>
      </footer>
    </article>
  );
}
