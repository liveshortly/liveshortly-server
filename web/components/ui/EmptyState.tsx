import type { ReactNode } from "react";
import Button from "./Button";
import Icon, { type IconName } from "./Icon";
import s from "./ui.module.css";

/** Empty and error states: a title, a plain-language message and, for errors,
 *  a Retry button. */
export default function EmptyState({
  icon,
  title,
  children,
  onRetry,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className={s.empty} role={onRetry ? "alert" : undefined}>
      {icon && <Icon name={icon} size={24} />}
      <h3 className="t-headline">{title}</h3>
      {children && <p className="t-body">{children}</p>}
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}
