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
- New styles go in a CSS module, not `globals.css`. Keep `globals.css` to
  cross-cutting rules.

## Checks

- `node scripts/check-contrast.mjs` — every text/background token pair passes AA 4.5:1.

`../design/` holds the earlier offline HTML mockups (version3 and before). They
are history, not the spec: the palette and layouts above win.
