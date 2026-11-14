"use client";

import s from "./session.module.css";

/**
 * Persistent banner shown when the agent host reports its Claude Code channel is
 * blocked by org policy (the `channel_blocked` event). Without it a viewer whose
 * message was silently dropped only sees a generic "did not show the typed
 * message"; this states the real cause and the fix.
 */
export default function ChannelBlockedBanner({
  message,
  attach,
  onDismiss,
}: {
  message: string;
  attach?: string;
  onDismiss: () => void;
}) {
  return (
    <div className={s.chanBlock} role="status">
      <div className={s.chanBlockBody}>
        <strong className={s.chanBlockTitle}>Viewer messages are blocked</strong>
        <p className={s.chanBlockText}>{message}</p>
        {attach && (
          <code className={s.chanBlockCmd}>{attach}</code>
        )}
      </div>
      <button
        type="button"
        className={s.chanBlockClose}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
