import Link from "next/link";
import { SITE_PAGES } from "@/lib/routes";
import s from "./shell.module.css";

/** The single muted legal line under public pages (LSW-36). */
export default function SiteFooter() {
  return (
    <footer className={`${s.legal} t-caption`}>
      <nav aria-label="About LiveShortly">
        {SITE_PAGES.map((p) => (
          <Link key={p.slug} href={`/${p.slug}`}>
            {p.label}
          </Link>
        ))}
        <a href="mailto:support@pocket.liveshortly.com">Contact</a>
      </nav>
    </footer>
  );
}
