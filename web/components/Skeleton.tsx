/**
 * A static placeholder block standing in for content that hasn't loaded yet.
 * Sized to match the real content so nothing shifts once it arrives. This app
 * deliberately has no idle-motion loops (see the near-static note in
 * globals.css), so this holds still rather than shimmering.
 */
export default function Skeleton({
  width = "100%",
  height = 14,
  radius = 3,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skel"
      aria-hidden
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
