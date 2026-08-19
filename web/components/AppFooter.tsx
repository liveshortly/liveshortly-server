import Link from "next/link";

/** Minimal footer for authenticated pages so a short screen doesn't look empty. */
export default function AppFooter() {
  return (
    <footer className="v3-footer">
      <span className="v3-footer-brand">LIVESHORTLY</span>
      <span className="v3-footer-links">
        <Link href="/docs">Docs</Link>
        <Link href="/install">Install CLI</Link>
        <a
          href="https://x.com/whorsehgal"
          target="_blank"
          rel="noopener noreferrer"
        >
          @whorsehgal
        </a>
      </span>
      <span className="v3-footer-copy">© LiveShortly</span>
    </footer>
  );
}
