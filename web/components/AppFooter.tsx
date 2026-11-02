import Link from "next/link";
import { SITE_LINKS } from "@/lib/routes";

/** The one footer (LSW-03), signed in or out. */
export default function AppFooter() {
  return (
    <footer className="v3-footer">
      <span className="v3-footer-brand">LiveShortly</span>
      <nav aria-label="Footer" className="v3-footer-links">
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        <a href="https://github.com/liveshortly" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </nav>
      <span className="v3-footer-copy">© LiveShortly</span>
    </footer>
  );
}
