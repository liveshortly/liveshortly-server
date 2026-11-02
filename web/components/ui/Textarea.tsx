import type { ComponentProps } from "react";
import s from "./ui.module.css";

/** Multi-line HUD field; same chrome and `invalid` contract as Input. */
export default function Textarea({
  invalid,
  className,
  ...rest
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={`${s.field} ${s.textarea}${className ? ` ${className}` : ""}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
