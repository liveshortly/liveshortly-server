import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent } from "hast";
import { ScrollPre } from "@/components/ui/CodeBlock";
import { slugify } from "./docs";
import s from "./docs.module.css";

const text = (n: ElementContent | Element): string =>
  n.type === "text" ? n.value : "children" in n ? n.children.map(text).join("") : "";

// h2/h3 get an id (matching the TOC) and a "#" anchor link.
function heading(Tag: "h2" | "h3"): Components["h2"] {
  return function H({ node, children }) {
    const id = node ? slugify(text(node)) : undefined;
    return (
      <Tag id={id} className={s.heading}>
        {children}
        {id && (
          <a href={`#${id}`} className={s.anchor} aria-label="Link to this section">
            #
          </a>
        )}
      </Tag>
    );
  };
}

const components: Components = {
  pre: ScrollPre,
  h2: heading("h2"),
  h3: heading("h3"),
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className={`md ${s.md}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
