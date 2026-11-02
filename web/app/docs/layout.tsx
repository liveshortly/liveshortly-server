import { loadAll } from "./docs";
import DocsSidebar from "./DocsSidebar";
import s from "./docs.module.css";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // The search index: titles and headings only, built at build time.
  const pages = loadAll().map(({ slug, title, headings }) => ({
    slug,
    title,
    headings: headings.map(({ text, id }) => ({ text, id })),
  }));
  return (
    <div className={s.shell}>
      <DocsSidebar pages={pages} />
      {children}
    </div>
  );
}
