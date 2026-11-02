import type { ReactNode } from "react";
import s from "./ui.module.css";

/** On/off toggle: a button with role="switch" + aria-checked, so Space/Enter
 *  flip it and assistive tech reads the state. `children` is the visible label. */
export default function Switch({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={s.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={s.switchTrack} aria-hidden>
        <span className={s.switchThumb} />
      </span>
      <span className="t-body">{children}</span>
    </button>
  );
}
