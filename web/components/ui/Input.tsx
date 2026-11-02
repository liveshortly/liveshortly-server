import type { ComponentProps } from "react";
import s from "./ui.module.css";

/** HUD text field. Give it an accessible name (`aria-label` or a <label>);
 *  `invalid` sets aria-invalid and the bad-tint border. */
export default function Input({
  invalid,
  className,
  ...rest
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={`${s.field}${className ? ` ${className}` : ""}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
