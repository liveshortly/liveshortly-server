import type { ComponentProps } from "react";
import Icon, { type IconName } from "./Icon";
import Tooltip from "./Tooltip";
import s from "./ui.module.css";

type Variant = "hud" | "prominent" | "destructive" | "ghost";

function cls(variant: Variant, extra?: string) {
  return [
    s.btn,
    variant === "prominent" && s.prominent,
    variant === "destructive" && s.destructive,
    variant === "ghost" && s.ghost,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * HUDButtonStyle: `hud` (outlined), `prominent` (filled accent),
 * `destructive` (red), `ghost` (no chrome). `busy` shows the spinner and
 * disables the button.
 */
export default function Button({
  variant = "hud",
  busy,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type={type}
      className={cls(variant, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className={s.spinner} aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only button: the label is the accessible name and the tooltip. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  className,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "children"> & {
  icon: IconName;
  label: string;
  variant?: Variant;
}) {
  return (
    <Tooltip text={label}>
      <button
        type={type}
        aria-label={label}
        className={cls(variant, `${s.iconBtn} ${className ?? ""}`)}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
}
