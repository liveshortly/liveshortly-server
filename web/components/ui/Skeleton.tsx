import s from "./ui.module.css";

/**
 * A static placeholder block standing in for content that hasn't loaded yet.
 * Sized to match the real content so nothing shifts once it arrives. It holds
 * still rather than shimmering (no idle-motion loops).
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
      className={s.skel}
      aria-hidden
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
