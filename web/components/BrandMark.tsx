/** The green LiveShortly brand mark (matches the favicon). */
export default function BrandMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="32" height="32" rx="6" fill="var(--green)" />
      <rect x="7" y="8.5" width="6.5" height="15" rx="1.5" fill="var(--panel)" />
      <rect
        x="16.5"
        y="8.5"
        width="8.5"
        height="15"
        rx="1.5"
        fill="var(--green)"
        stroke="var(--panel)"
        strokeWidth="2"
      />
    </svg>
  );
}
