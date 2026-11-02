import type { ComponentProps } from "react";
import s from "./ui.module.css";

/** Native <select> in HUD chrome (keyboard, screen readers and the mobile
 *  picker come for free). Pass <option>s as children. */
export default function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={`${s.field} ${s.select}${className ? ` ${className}` : ""}`} {...rest} />;
}
