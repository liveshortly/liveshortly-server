"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";
import s from "./ui.module.css";

/**
 * Hover/focus tooltip for one focusable child. The text is wired to the child
 * with aria-describedby and Escape hides it (WCAG 1.4.13) — never use a bare
 * `title` for this.
 */
export default function Tooltip({
  text,
  children,
}: {
  text: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  const [off, setOff] = useState(false);
  return (
    <span
      className={s.tipWrap}
      onKeyDown={(e) => e.key === "Escape" && setOff(true)}
      onMouseLeave={() => setOff(false)}
      onBlur={() => setOff(false)}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span role="tooltip" id={id} className={`${s.tip} t-callout${off ? ` ${s.tipOff}` : ""}`}>
        {text}
      </span>
    </span>
  );
}
