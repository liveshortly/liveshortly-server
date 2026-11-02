import type { HTMLAttributes } from "react";
import s from "./ui.module.css";

/** hudPanel: surface fill + hairline, HUD radius. `accent` tints it green for
 *  the one element that matters on a screen (hudAccentPanel). */
export default function Card({
  accent,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { accent?: boolean }) {
  return (
    <div
      className={[s.card, accent && s.cardAccent, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
