import Icon, { type IconName } from "./Icon";
import s from "./ui.module.css";

/**
 * The one status pill (HUDLiveBadge + reach states). Each state has its own
 * shape — pulsing dot, hollow ring or icon — and its word, never colour alone.
 */
export type BadgeStatus = "live" | "ended" | "private" | "link" | "public" | "feed" | "shared";

const STATES: Record<BadgeStatus, { label: string; icon?: IconName }> = {
  live: { label: "Live" },
  ended: { label: "Ended" },
  private: { label: "Private", icon: "lock" },
  link: { label: "Link", icon: "link" },
  public: { label: "Public", icon: "globe" },
  feed: { label: "On feed", icon: "dot.radiowaves.left.and.right" },
  shared: { label: "Shared", icon: "person.2" },
};

export default function StatusBadge({
  status,
  label,
  title,
  className,
}: {
  status: BadgeStatus;
  /** Replaces the state word, e.g. "Ended · quota". */
  label?: string;
  title?: string;
  className?: string;
}) {
  const st = STATES[status];
  return (
    <span
      className={`${s.badge} ${s[`badge-${status}`] ?? ""} t-caption ${className ?? ""}`}
      title={title}
    >
      {st.icon ? (
        <Icon name={st.icon} size={11} />
      ) : (
        <span
          className={`${s.dot} ${status === "live" ? s.dotLive : s.dotEnded}`}
          aria-hidden
        />
      )}
      {label ?? st.label}
    </span>
  );
}
