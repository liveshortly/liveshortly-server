/**
 * Avatar — a deterministic, theme-matched cartoon avatar.
 *
 * No 200 hand-drawn files: the avatar is generated from the `seed` (a stable
 * user id / handle). A hash of the seed picks one combination of background
 * shade, head shape, eyes, mouth and accessory — 5 greens × 2 heads × 6 eyes ×
 * 6 mouths × 5 accessories = 3600 distinct faces. Because it's a pure function
 * of the seed, every user is "assigned" the same avatar forever the moment they
 * sign in, with nothing to store server-side.
 *
 * Theme: paper-HUD. Background is the site green (#1f7a4d family); the character
 * is a flat gray/black silhouette (Notion-esque), features cut back to green.
 */

const GREENS = ["#1f7a4d", "#20694a", "#2b8f5e", "#186a41", "#248a54"];
const INKS = ["#1a1916", "#33322e", "#45443f"];

// FNV-1a-ish string hash → unsigned 32-bit. Deterministic across renders.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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
  const bg = GREENS[h % GREENS.length];
  const ink = INKS[(h >>> 3) % INKS.length];
  const head = (h >>> 6) % 2; // 0 circle, 1 rounded square
  const eye = (h >>> 9) % 6;
  const mouth = (h >>> 13) % 6;
  const acc = (h >>> 17) % 5;
  const green = bg; // features are cut back to the background

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? `Avatar for ${s}`}
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="100" height="100" rx={rounded ? 22 : 50} fill={bg} />
      {head === 0 ? (
        <circle cx="50" cy="53" r="33" fill={ink} />
      ) : (
        <rect x="18" y="21" width="64" height="64" rx="20" fill={ink} />
      )}
      <Eyes variant={eye} color={green} />
      <Mouth variant={mouth} color={green} />
      <Accessory variant={acc} color={ink} head={head} />
    </svg>
  );
}

function Eyes({ variant, color }: { variant: number; color: string }) {
  const lx = 38;
  const rx = 62;
  const y = 47;
  switch (variant) {
    case 0:
      return (
        <>
          <circle cx={lx} cy={y} r="4.2" fill={color} />
          <circle cx={rx} cy={y} r="4.2" fill={color} />
        </>
      );
    case 1:
      return (
        <>
          <ellipse cx={lx} cy={y} rx="3.3" ry="5.4" fill={color} />
          <ellipse cx={rx} cy={y} rx="3.3" ry="5.4" fill={color} />
        </>
      );
    case 2:
      return (
        <>
          <rect x={lx - 5} y={y - 1.4} width="10" height="2.8" rx="1.4" fill={color} />
          <rect x={rx - 5} y={y - 1.4} width="10" height="2.8" rx="1.4" fill={color} />
        </>
      );
    case 3:
      return (
        <>
          <circle cx={lx} cy={y} r="6" fill={color} />
          <circle cx={rx} cy={y} r="6" fill={color} />
        </>
      );
    case 4:
      return (
        <g stroke={color} strokeWidth="3" fill="none" strokeLinecap="round">
          <path d={`M${lx - 5} ${y + 2} q5 -7 10 0`} />
          <path d={`M${rx - 5} ${y + 2} q5 -7 10 0`} />
        </g>
      );
    default:
      return (
        <>
          <circle cx={lx} cy={y} r="4.2" fill={color} />
          <path d={`M${rx - 5} ${y} q5 -6 10 0`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
  }
}

function Mouth({ variant, color }: { variant: number; color: string }) {
  const y = 66;
  switch (variant) {
    case 0:
      return <path d={`M39 ${y} q11 11 22 0`} stroke={color} strokeWidth="3.4" fill="none" strokeLinecap="round" />;
    case 1:
      return <rect x="41" y={y - 1.6} width="18" height="3.2" rx="1.6" fill={color} />;
    case 2:
      return <circle cx="50" cy={y + 1} r="4.4" fill={color} />;
    case 3:
      return <path d={`M37 ${y - 3} q13 15 26 0 z`} fill={color} />;
    case 4:
      return <path d={`M43 ${y} q3.5 5 7 0 q3.5 5 7 0`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />;
    default:
      return <path d={`M40 ${y} q4 -4 7 0 q4 4 7 0 q4 -4 6 0`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />;
  }
}

function Accessory({ variant, color, head }: { variant: number; color: string; head: number }) {
  const topY = head === 0 ? 20 : 21;
  switch (variant) {
    case 0:
      return null;
    case 1:
      return (
        <>
          <rect x="48.5" y={topY - 8} width="3" height="10" rx="1.5" fill={color} />
          <circle cx="50" cy={topY - 10} r="4" fill={color} />
        </>
      );
    case 2:
      return (
        <g stroke={color} strokeWidth="3" strokeLinecap="round">
          <path d="M32 36 q6 -3 12 -1" />
          <path d="M56 35 q6 -2 12 1" />
        </g>
      );
    case 3:
      return <rect x="20" y={topY + 2} width="60" height="6" rx="3" fill={color} />;
    default:
      return (
        <g stroke={color} strokeWidth="3.4" fill="none">
          <path d="M22 50 q28 -34 56 0" />
          <rect x="17" y="48" width="8" height="14" rx="3" fill={color} stroke="none" />
          <rect x="75" y="48" width="8" height="14" rx="3" fill={color} stroke="none" />
        </g>
      );
  }
}
