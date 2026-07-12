/**
 * Avatar — deterministic line-art character, in the site's green.
 *
 * Notion-style ink portrait: bold black hair as filled shapes, thin-line face
 * (brows / eyes / nose / mouth), glasses / beards / accents — on a green tile
 * (the site's live-green family). Everything is a pure function of the `seed`
 * (a user id / handle / email), so a user is "assigned" the same face forever
 * with nothing stored. Gender biases the hairstyle + facial hair; when the seed
 * is an email we infer it from the name, else fall back to the seed hash.
 *
 * The SVG body is assembled as a string and injected — the part builders are
 * plain string functions shared with the offline sample sheet, not per-part JSX.
 */

// Site green family — the only backgrounds (theme-matched, per the brief).
const GREENS = ["#1f7a4d", "#20694a", "#248a54", "#186a41", "#2b8f5e"];
const INK = "#14140f";
const SKIN = "rgba(255,255,255,0.13)"; // subtle lift so the face reads off the green

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const pick = <T,>(arr: T[], n: number): T => arr[n % arr.length];

const HAIR_FEM = ["longStraight", "longWavy", "curlyVol", "bun", "ponytail", "bob", "braids", "shoulder"];
const HAIR_MASC = ["buzz", "crop", "sidePart", "bald", "curlyShort", "quiff", "receding"];
const HAIR_NEU = ["afro", "medium", "cap", "beanie", "short"];
const BEARDS = ["none", "none", "stubble", "beard", "goatee", "mustache"];

function headOutline(): string {
  return `<path d="M50 20 C33 20 30 34 30 46 C30 61 39 72 50 72 C61 72 70 61 70 46 C70 34 67 20 50 20 Z" fill="${SKIN}" stroke="${INK}" stroke-width="2"/><path d="M42 71 L42 79 M58 71 L58 79" stroke="${INK}" stroke-width="2" fill="none"/>`;
}
function ears(): string {
  return `<circle cx="29" cy="48" r="3.4" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="71" cy="48" r="3.4" fill="none" stroke="${INK}" stroke-width="2"/>`;
}
function backHair(style: string): string {
  switch (style) {
    case "longStraight": return `<path d="M26 40 C26 22 40 15 50 15 C60 15 74 22 74 40 L76 84 L66 82 C70 60 68 40 50 40 C32 40 30 60 34 82 L24 84 Z" fill="${INK}"/>`;
    case "longWavy": return `<path d="M25 42 C24 22 40 14 50 14 C60 14 76 22 75 42 C79 56 74 70 78 86 C70 80 70 74 66 78 C68 58 66 40 50 40 C34 40 32 58 34 78 C30 74 30 80 22 86 C26 70 21 56 25 42 Z" fill="${INK}"/>`;
    case "curlyVol": return `<g fill="${INK}"><circle cx="30" cy="34" r="12"/><circle cx="50" cy="26" r="14"/><circle cx="70" cy="34" r="12"/><circle cx="26" cy="50" r="9"/><circle cx="74" cy="50" r="9"/><circle cx="30" cy="64" r="8"/><circle cx="70" cy="64" r="8"/></g>`;
    case "ponytail": return `<path d="M72 30 C82 34 84 52 80 70 C78 60 74 58 72 60 Z" fill="${INK}"/>`;
    case "braids": return `<g fill="${INK}"><path d="M28 42 C26 60 30 74 28 86 L34 86 C33 72 32 58 34 44 Z"/><path d="M72 42 C74 60 70 74 72 86 L66 86 C67 72 68 58 66 44 Z"/></g>`;
    case "shoulder": return `<path d="M27 42 C27 24 40 16 50 16 C60 16 73 24 73 42 L74 74 L66 72 C69 56 67 40 50 40 C33 40 31 56 34 72 L26 74 Z" fill="${INK}"/>`;
    default: return "";
  }
}
function frontHair(style: string): string {
  switch (style) {
    case "longStraight": return `<path d="M28 42 C28 24 40 16 50 16 C60 16 72 24 72 42 C66 34 60 30 50 30 C40 30 34 34 28 42 Z" fill="${INK}"/>`;
    case "longWavy": return `<path d="M28 44 C28 24 41 16 50 16 C59 16 72 24 72 44 C67 33 62 34 55 30 C58 36 52 36 50 32 C48 37 42 34 45 30 C38 34 33 34 28 44 Z" fill="${INK}"/>`;
    case "curlyVol": return `<path d="M30 40 C32 26 42 20 50 20 C58 20 68 26 70 40 C64 32 58 30 50 30 C42 30 36 32 30 40 Z" fill="${INK}"/>`;
    case "bun": return `<g fill="${INK}"><circle cx="50" cy="16" r="9"/><path d="M29 44 C29 26 41 18 50 18 C59 18 71 26 71 44 C65 34 60 31 50 31 C40 31 35 34 29 44 Z"/></g>`;
    case "ponytail": return `<path d="M29 42 C30 25 41 18 50 18 C59 18 70 25 71 42 C65 33 59 31 50 31 C41 31 35 33 29 42 Z" fill="${INK}"/>`;
    case "bob": return `<path d="M27 50 C27 26 40 17 50 17 C60 17 73 26 73 50 L72 56 C70 40 66 32 50 32 C34 32 30 40 28 56 Z" fill="${INK}"/>`;
    case "braids": return `<path d="M29 42 C30 25 41 17 50 17 C59 17 70 25 71 42 C65 33 59 31 50 31 C41 31 35 33 29 42 Z" fill="${INK}"/>`;
    case "shoulder": return `<path d="M28 44 C28 25 41 17 50 17 C59 17 72 25 72 44 C66 34 60 31 50 31 C40 31 34 34 28 44 Z" fill="${INK}"/>`;
    case "buzz": return `<path d="M31 40 C33 27 42 22 50 22 C58 22 67 27 69 40 C63 34 58 33 50 33 C42 33 37 34 31 40 Z" fill="${INK}" opacity="0.9"/>`;
    case "crop": return `<path d="M30 42 C31 27 42 21 50 21 C58 21 69 27 70 42 C68 33 62 31 50 31 C38 31 32 33 30 42 Z" fill="${INK}"/>`;
    case "sidePart": return `<path d="M29 42 C30 25 42 19 50 19 C60 19 71 26 71 40 C66 33 60 31 45 32 C40 33 33 35 29 44 Z" fill="${INK}"/>`;
    case "bald": return ``;
    case "receding": return `<path d="M32 40 C34 30 40 26 44 27 C40 33 40 36 40 40 C36 39 34 39 32 40 Z M68 40 C66 30 60 26 56 27 C60 33 60 36 60 40 C64 39 66 39 68 40 Z" fill="${INK}"/>`;
    case "curlyShort": return `<g fill="${INK}"><circle cx="36" cy="28" r="7"/><circle cx="50" cy="24" r="8"/><circle cx="64" cy="28" r="7"/><circle cx="30" cy="38" r="6"/><circle cx="70" cy="38" r="6"/></g>`;
    case "quiff": return `<path d="M30 40 C32 24 44 20 50 22 C54 14 66 20 68 34 C64 30 60 30 55 31 C58 26 52 26 50 30 C46 28 40 30 30 40 Z" fill="${INK}"/>`;
    case "afro": return `<path d="M30 42 C34 34 42 32 50 32 C58 32 66 34 70 42 C64 35 58 33 50 33 C42 33 36 35 30 42 Z" fill="${INK}"/><circle cx="50" cy="24" r="20" fill="${INK}"/>`;
    case "medium": return `<path d="M28 46 C28 26 41 18 50 18 C59 18 72 26 72 46 C67 35 60 32 50 32 C40 32 33 35 28 46 Z" fill="${INK}"/>`;
    case "cap": return `<path d="M28 40 L72 40 C72 30 62 24 50 24 C38 24 28 30 28 40 Z M28 40 L20 42 L28 45 Z" fill="${INK}"/>`;
    case "beanie": return `<path d="M28 40 C28 26 40 20 50 20 C60 20 72 26 72 40 C72 42 70 43 68 43 L32 43 C30 43 28 42 28 40 Z M27 43 L73 43 L73 47 L27 47 Z" fill="${INK}"/>`;
    case "short": return `<path d="M30 41 C32 27 42 22 50 22 C58 22 68 27 70 41 C64 33 58 32 50 32 C42 32 36 33 30 41 Z" fill="${INK}"/>`;
    default: return "";
  }
}
function facialHair(style: string): string {
  switch (style) {
    case "stubble": return `<path d="M36 58 Q50 70 64 58 Q60 68 50 68 Q40 68 36 58 Z" fill="${INK}" opacity="0.3"/>`;
    case "beard": return `<path d="M34 52 Q34 74 50 76 Q66 74 66 52 Q60 62 50 62 Q40 62 34 52 Z" fill="${INK}"/>`;
    case "goatee": return `<path d="M45 62 Q50 74 55 62 Q52 66 50 66 Q48 66 45 62 Z" fill="${INK}"/><path d="M44 55 Q50 59 56 55" stroke="${INK}" stroke-width="2.4" fill="none"/>`;
    case "mustache": return `<path d="M42 56 Q50 60 58 56 Q54 60 50 59 Q46 60 42 56 Z" fill="${INK}"/>`;
    default: return "";
  }
}
function brows(n: number): string {
  const s = [
    "<path d='M38 43 Q42 41 46 43' /><path d='M54 43 Q58 41 62 43' />",
    "<path d='M38 42 L46 42' /><path d='M54 42 L62 42' />",
    "<path d='M38 43 Q42 40 46 42' /><path d='M54 42 Q58 40 62 43' />",
  ][n % 3];
  return `<g stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round">${s}</g>`;
}
function eyes(n: number): string {
  switch (n % 4) {
    case 0: return `<circle cx="42" cy="49" r="2.4" fill="${INK}"/><circle cx="58" cy="49" r="2.4" fill="${INK}"/>`;
    case 1: return `<path d="M39 49 Q42 46 45 49" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M55 49 Q58 46 61 49" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 2: return `<circle cx="42" cy="49" r="3" fill="none" stroke="${INK}" stroke-width="1.6"/><circle cx="42" cy="49" r="1.1" fill="${INK}"/><circle cx="58" cy="49" r="3" fill="none" stroke="${INK}" stroke-width="1.6"/><circle cx="58" cy="49" r="1.1" fill="${INK}"/>`;
    default: return `<path d="M40 49 L44 49 M56 49 L60 49" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  }
}
function glasses(kind: number): string {
  if (kind === 0) return "";
  if (kind === 1) return `<g fill="none" stroke="${INK}" stroke-width="2"><rect x="37" y="45" width="10" height="8" rx="2"/><rect x="53" y="45" width="10" height="8" rx="2"/><path d="M47 49 L53 49 M37 47 L33 46 M63 47 L67 46"/></g>`;
  return `<g fill="none" stroke="${INK}" stroke-width="2"><circle cx="42" cy="49" r="5"/><circle cx="58" cy="49" r="5"/><path d="M47 49 L53 49 M37 48 L33 47 M63 48 L67 47"/></g>`;
}
function nose(): string {
  return `<path d="M50 51 L48 57 Q50 59 52 57" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
}
function mouth(n: number): string {
  const m = [
    `<path d="M43 63 Q50 68 57 63" />`,
    `<path d="M44 64 L56 64" />`,
    `<path d="M44 63 Q50 66 56 63" />`,
    `<path d="M45 64 Q50 62 55 64" />`,
  ][n % 4];
  return `<g stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round">${m}</g>`;
}
function accent(n: number, show: boolean): string {
  if (!show) return "";
  return [
    `<path d="M84 22 l2 5 5 1 -4 4 1 5 -4 -3 -4 3 1 -5 -4 -4 5 -1 Z" fill="${INK}"/>`,
    `<path d="M84 20 v10 M79 25 h10" stroke="${INK}" stroke-width="2.4"/>`,
    `<circle cx="82" cy="24" r="2" fill="${INK}"/><circle cx="88" cy="24" r="2" fill="${INK}"/><circle cx="85" cy="30" r="2" fill="${INK}"/>`,
  ][n % 3];
}

const FEM_NAMES = new Set(["anjali", "priya", "neha", "pooja", "sneha", "divya", "riya", "kavya", "meera", "aditi", "swati", "shreya", "isha", "tanya", "nisha", "ritu", "sara", "sarah", "emma", "olivia", "sophia", "emily", "anna", "maria", "laura", "julia", "grace", "alice", "chloe", "mia", "ava", "ella", "lily", "zoe", "hannah", "natalie"]);
const MASC_NAMES = new Set(["rohit", "amit", "rahul", "vijay", "arjun", "karan", "sahil", "mukul", "ankit", "raj", "vikram", "suresh", "ramesh", "aditya", "nikhil", "harsh", "john", "mike", "david", "james", "alex", "daniel", "chris", "ryan", "kevin", "brian", "mark", "paul", "tom", "sam", "jack", "luke", "adam", "noah", "liam", "ethan"]);

function genderFor(seed: string, h: number): "fem" | "masc" | "neu" {
  const local = (seed.split("@")[0] || "").toLowerCase();
  const first = local.split(/[._\-0-9\s]+/)[0] || local;
  if (MASC_NAMES.has(first)) return "masc";
  if (FEM_NAMES.has(first)) return "fem";
  if (seed.includes("@") && /(a|i|ia|na|ya|elle|ette)$/.test(first)) return "fem";
  return (["fem", "masc", "neu"] as const)[(h >>> 28) % 3];
}

export default function Avatar({
  seed,
  size = 28,
  rounded = true,
  className,
  title,
}: {
  seed?: string | null;
  size?: number;
  /** true → squircle (default), false → circle. */
  rounded?: boolean;
  className?: string;
  title?: string;
}) {
  const s = (seed ?? "?").trim() || "?";
  const h = hash(s);
  const bg = pick(GREENS, h);
  const gender = genderFor(s, h);
  const hairPool = gender === "fem" ? HAIR_FEM : gender === "masc" ? HAIR_MASC : HAIR_NEU;
  const hair = pick(hairPool, h >>> 4);
  const beard = gender === "masc" ? pick(BEARDS, h >>> 8) : "none";

  const body =
    `<rect width="100" height="100" rx="${rounded ? 20 : 50}" fill="${bg}"/>` +
    backHair(hair) +
    headOutline() +
    ears() +
    frontHair(hair) +
    facialHair(beard) +
    brows(h >>> 16) +
    eyes(h >>> 18) +
    glasses((h >>> 11) % 3) +
    nose() +
    mouth(h >>> 20) +
    accent(h >>> 22, ((h >>> 14) % 4) === 0);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? `Avatar for ${s}`}
      style={{ display: "block", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
