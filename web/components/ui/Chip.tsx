import type { ReactNode } from "react";
import s from "./ui.module.css";

/** HUDChip: a small capsule for counts and short states — sunken with a
 *  hairline, or filled accent. */
export default function Chip({
  filled,
  title,
  children,
}: {
  filled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${s.chip}${filled ? ` ${s.chipFilled}` : ""}`} title={title}>
      {children}
    </span>
  );
}
