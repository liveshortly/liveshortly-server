// WCAG AA check for text/background token pairs in app/tokens.css.
// Run: node scripts/check-contrast.mjs  (exits 1 if any pair is below 4.5:1)
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");
const block = (sel) => {
  const body = css.slice(css.indexOf(sel)).match(/\{([^}]*)\}/)[1];
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
};
const light = block(":root {\n  color-scheme: light;");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs = [
  ...["fg", "fg-2", "fg-3"].flatMap((f) =>
    ["canvas", "surface", "raised", "sunken"].map((b) => [f, b]),
  ),
  // Status colours are text on these, never on --sunken.
  ...["accent", "warn", "bad", "info", "admin"].flatMap((f) =>
    ["canvas", "surface", "raised"].map((b) => [f, b]),
  ),
  ["on-accent", "accent"],
  ["code-ink", "code-bg"],
];

let fails = 0;
for (const [name, t] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of pairs) {
    if (!t[fg] || !t[bg]) throw new Error(`missing --${fg} or --${bg} (${name})`);
    const r = ratio(t[fg], t[bg]);
    const ok = r >= 4.5;
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} --${fg} on --${bg}: ${r.toFixed(2)}`);
  }
}
console.log(fails ? `\n${fails} pair(s) below AA 4.5:1` : "\nAll pairs pass AA 4.5:1");
process.exit(fails ? 1 : 0);
