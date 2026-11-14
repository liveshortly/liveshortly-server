"use client";

import { useState } from "react";
import { postComment, type SessionEvent } from "@/lib/api";
import s from "./session.module.css";

type Option = { label?: string; description?: string };
type Question = {
  question?: string;
  header?: string;
  options?: Option[];
  multiSelect?: boolean;
};

/**
 * Renders the agent's interactive AskUserQuestion prompt (its questions +
 * options) in the web, from a `question_requested` event. Tapping an option
 * sends it to the agent as an advisory comment — Claude Code exposes no path to
 * formally answer the tool from here, and the agent answers it in the terminal.
 */
export default function QuestionBar({
  sessionId,
  probe,
  canComment,
}: {
  sessionId: string;
  probe: SessionEvent;
  canComment: boolean;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const raw = (probe.payload as Record<string, unknown>)?.questions;
  const questions: Question[] = Array.isArray(raw) ? (raw as Question[]) : [];
  if (questions.length === 0) return null;

  const suggest = async (q: Question, label: string) => {
    if (!canComment || busy) return;
    setBusy(true);
    try {
      await postComment(
        sessionId,
        `Answer to “${q.header ?? q.question ?? "question"}”: ${label}`,
      );
      setSent(label);
    } catch {
      // best-effort advisory; nothing to do on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.qbar} aria-label="Agent question">
      <div className={s.qbarHead}>Agent is asking</div>
      {questions.map((q, i) => (
        <div key={i} className={s.qblock}>
          {q.header && <strong className={s.qheader}>{q.header}</strong>}
          {q.question && <p className={s.qtext}>{q.question}</p>}
          <div className={s.qopts}>
            {(q.options ?? []).map((o, j) => (
              <button
                key={j}
                type="button"
                className={s.qopt}
                disabled={!canComment || busy}
                onClick={() => suggest(q, o.label ?? "")}
                title={o.description}
              >
                <span className={s.qoptLabel}>{o.label}</span>
                {o.description && (
                  <span className={s.qoptDesc}>{o.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className={s.qnote}>
        {canComment
          ? sent
            ? `Suggested “${sent}” to the agent.`
            : "Tap an option to suggest it to the agent (advisory — the agent confirms it in the terminal)."
          : "The agent is waiting for the owner to choose."}
      </p>
    </section>
  );
}
