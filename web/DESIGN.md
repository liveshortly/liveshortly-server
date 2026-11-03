# Web design system

**Source of truth: the PocketAI Mac app palette** (`PocketUI/Resources/Colors.xcassets`).
The web mirrors it in one file, `app/tokens.css`. Change a colour there, not in
a component. Two values are nudged from the Mac assets for WCAG AA; the header
of `tokens.css` lists them.

## Where things live

| What | File |
|---|---|
| Colour, type, spacing, radius tokens (light + dark) | `app/tokens.css` |
| Tailwind `@theme` bridge, base elements, shell layout, markdown, landing | `app/globals.css` |
| Component library (Button, Card, Chip, Dialog, Menu, Tooltip, …) | `components/ui/*` + `ui.module.css` |
| Per-screen styles | CSS modules next to the screen (`*.module.css`) |
| Live token/component gallery (admin-only) | `/design` (`app/design/page.tsx`) |

## Rules

- Colours only through tokens (`var(--fg)`, `var(--accent)`, …); no hex in components.
- `--fg-3` is meta text only, never body text. Status colours (`--accent`,
  `--warn`, `--bad`, `--info`) are text on canvas/surface/raised, not on `--sunken`.
- Type: `--font-sans` (SF/Inter) for reading; `--font-mono` (JetBrains Mono) only
  for machine output (commands, code, ids, timestamps). Use the `.t-*` type classes.
- Theme: `ThemeProvider` sets `data-theme` before paint; without JS the page is light.
- Focus: one ring for everything — `:focus-visible` in `globals.css`
  (`--focus-ring`, 2px, offset 2px). Don't restyle it in a component; a wrapper
  that hides its input's outline draws the same ring with `:focus-within`.
  Targets are ≥24×24px (WCAG 2.5.8): fix with padding/min-size in the component's CSS.
- New styles go in a CSS module, not `globals.css`. Keep `globals.css` to
  cross-cutting rules.
- Three breakpoints only — phone <768, tablet 768–1100, desktop >1100 (the
  literal queries are listed in `tokens.css`). Page chrome uses `@media`;
  components in panes of varying width use `@container` on their own width.
- Identity is text (LSW-33): people are their `@handle`, never a profile image,
  initials circle or identicon. Lists of people are plain handle lists.
- Site links (Feed · Docs · Install · Changelog · GitHub) live in the header on
  every page, in its menu sheet under 768px (LSW-34). There is no footer nav.
- PWA: `app/manifest.ts`, icons in `public/icons/` + `app/apple-icon.png`,
  `public/sw.js` (Web Push + offline page; caches only `/offline` and
  immutable `/_next/static` files — never API responses or page HTML).

## Checks

- `node scripts/check-contrast.mjs` — every text/background token pair passes AA 4.5:1,
  and `--focus-ring` is ≥3:1 on every surface.
- `npm run a11y` — builds, starts the app and runs axe-core (WCAG 2.2 AA) over the
  public pages, light + dark, phone + desktop; fails on serious/critical (CI job `a11y`).

`../design/` holds the earlier offline HTML mockups (version3 and before). They
are history, not the spec: the palette and layouts above win.
