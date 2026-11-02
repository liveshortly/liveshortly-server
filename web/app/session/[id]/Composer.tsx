"use client";

import { useEffect, useRef, useState } from "react";
import { loginUrl, postTyping } from "@/lib/api";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import s from "./session.module.css";

/** Mac composer (LSChatView.composer): surface with a rule above, a
 *  multi-line field, a round green send button, the typing line and hint. */
export default function Composer({
  sessionId,
  typing,
  focusSignal,
  onSend,
}: {
  sessionId: string;
  /** "X is typing…" line, or null. */
  typing: string | null;
  /** Bumped to pull focus (a fresh input request). */
  focusSignal?: string | null;
  /** Echoes optimistically and resolves false when the server refused it. */
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastPing = useRef(0);

  useEffect(() => {
    if (focusSignal) ref.current?.focus();
  }, [focusSignal]);

  // Grow with the content, capped by CSS max-height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const send = async (msg = text) => {
    const m = msg.trim();
    if (!m) return;
    setText("");
    setFailed(null);
    if (!(await onSend(m))) setFailed(m);
  };

  return (
    <div className={s.composer}>
      {typing && <span className={`${s.muted} t-caption`}>{typing}</span>}
      {failed && (
        <div className={`${s.errText} ${s.composerErr} t-callout`} role="alert">
          Couldn&apos;t send your message.
          <Button variant="ghost" onClick={() => send(failed)}>
            Retry
          </Button>
        </div>
      )}
      <div className={s.composerRow}>
        <textarea
          ref={ref}
          className={`${s.field} t-body`}
          rows={1}
          value={text}
          placeholder="Message this session…"
          aria-label="Message this session"
          onChange={(e) => {
            setText(e.target.value);
            const now = Date.now();
            if (e.target.value.trim() && now - lastPing.current > 3000) {
              lastPing.current = now;
              postTyping(sessionId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className={s.send}
          disabled={!text.trim()}
          onClick={() => send()}
          aria-label="Send to this session"
          title="Send (⏎)"
        >
          <Icon name="arrow.up" size={14} />
        </button>
      </div>
      <span className={`${s.muted} t-caption ${s.hint}`}>
        ⏎ send · ⇧⏎ newline · goes to the agent as a viewer message
      </span>
    </div>
  );
}

/** Footer in place of the composer when the viewer can't comment. */
export function ReadOnlyFooter({ ended, signedOut }: { ended: boolean; signedOut: boolean }) {
  return (
    <div className={`${s.footer} t-callout`}>
      {ended ? (
        "Session ended — read only."
      ) : signedOut ? (
        <>
          <span>Watching as a guest.</span>
          <a className={s.signIn} href={loginUrl()}>
            Sign in to comment
          </a>
        </>
      ) : (
        "Read only — you can watch but not comment."
      )}
    </div>
  );
}
