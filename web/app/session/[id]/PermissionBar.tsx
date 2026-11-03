"use client";

import { useState } from "react";
import { postDecision, type SessionEvent } from "@/lib/api";
import { toolSummary } from "@/lib/transcript";
import { agentCaps, agentTitle } from "@/lib/utils";
import { Diff } from "@/components/EventStream";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import s from "./session.module.css";

type Decision = "allow" | "deny" | "always";
type P = Record<string, unknown>;
const str = (p: unknown, k: string) => {
  const v = (p as P | undefined)?.[k];
  return typeof v === "string" ? v : undefined;
};

/**
 * The agent is waiting (Mac LSPermissionBar + LSProbeDetailView): the message,
 * a one-line summary of the tool call that opens the full review sheet, and
 * the answers. Owners decide; everyone else is told who will.
 */
export default function PermissionBar({
  sessionId,
  probe,
  toolCall,
  framework,
  canDecide,
  ownerHandle,
}: {
  sessionId: string;
  probe: SessionEvent;
  toolCall: SessionEvent | null;
  framework: string | null | undefined;
  canDecide: boolean;
  ownerHandle: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Decision | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const permission = str(probe.payload, "kind") === "permission";
  const agent = agentTitle(framework);
  const message = str(probe.payload, "message");
  const risky =
    str(probe.payload, "risk") === "high" || str(toolCall?.payload, "risk") === "high";
  const canAlways = agentCaps(framework).alwaysAllow;

  const decide = async (d: Decision) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await postDecision(sessionId, d);
      setAnswered(d);
      setReviewing(false);
    } catch {
      setErr("Couldn't send that answer — try again.");
    } finally {
      setBusy(false);
    }
  };

  const buttons = (
    <>
      <Button variant="destructive" disabled={busy} onClick={() => decide("deny")}>
        Deny
      </Button>
      {canAlways && (
        <Button disabled={busy} onClick={() => decide("always")}>
          Always allow for this session
        </Button>
      )}
      <Button variant="prominent" busy={busy} onClick={() => decide("allow")}>
        Allow
      </Button>
    </>
  );

  return (
    <section className={s.permBar} aria-label={permission ? "Permission request" : "Input request"}>
      <div className={s.permHead}>
        <Icon name="exclamationmark.triangle" />
        <span className="t-caption">
          {permission ? "Permission requested" : "Input requested"}
        </span>
        {risky && <span className={`${s.riskChip} t-caption`}>High risk</span>}
      </div>
      <p className="t-body">{message || `${agent} is waiting for you.`}</p>

      {toolCall && (
        <button type="button" className={s.reviewRow} onClick={() => setReviewing(true)}>
          <Icon name="terminal" size={14} />
          <span className={`${s.reviewGist} t-mono`}>{toolSummary(toolCall)}</span>
          <span className="t-caption">Review</span>
          <Icon name="chevron.right" size={14} />
        </button>
      )}

      {answered ? (
        <p className="t-callout" role="status">
          You answered: {answered === "deny" ? "denied" : answered === "always" ? "allowed for this session" : "allowed"}.
        </p>
      ) : permission && canDecide ? (
        <div className={s.permActions}>{buttons}</div>
      ) : permission ? (
        <p className={`${s.muted} t-callout`}>
          Waiting for @{ownerHandle} to approve · you can watch
        </p>
      ) : (
        <p className={`${s.muted} t-callout`}>
          Type a reply below — it reaches {agent} on its next turn.
        </p>
      )}
      {err && (
        <p className={`${s.errText} t-callout`} role="alert">
          {err}
        </p>
      )}

      {toolCall && (
        <Dialog
          open={reviewing}
          onClose={() => setReviewing(false)}
          title={permission ? "Permission request" : "Input request"}
          sheet
        >
          <div
            className={s.review}
            onKeyDown={(e) => {
              // ⌘⏎ Allow / ⌘⌫ Deny, only while the sheet has focus.
              if (!canDecide || answered || !(e.metaKey || e.ctrlKey)) return;
              if (e.key === "Enter") {
                e.preventDefault();
                decide("allow");
              } else if (e.key === "Backspace") {
                e.preventDefault();
                decide("deny");
              }
            }}
          >
            <div className={s.reviewBody}>
              {message && <p className="t-body">{message}</p>}
              <ToolDetail call={toolCall} />
            </div>
            {err && (
              <p className={`${s.errText} t-callout`} role="alert">
                {err}
              </p>
            )}
            {canDecide && permission && !answered && (
              <div className={s.reviewActions}>
                <span className={`${s.muted} t-caption`}>⌘⏎ allow · ⌘⌫ deny</span>
                {buttons}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** The exact command, diff or file content. Text only — never HTML. */
function ToolDetail({ call }: { call: SessionEvent }) {
  const tool = str(call.payload, "tool") ?? str(call.payload, "tool_name") ?? "tool";
  const input = (call.payload?.input ?? call.payload ?? {}) as P;
  const path = str(input, "file_path");
  const [copied, setCopied] = useState(false);

  let body: React.ReactNode;
  if (tool === "Bash") {
    const cmd = str(input, "command") ?? str(call.payload, "command") ?? "";
    body = (
      <>
        {str(input, "description") && (
          <p className={`${s.muted} t-callout`}>{str(input, "description")}</p>
        )}
        <div className={s.cmdWrap}>
          <pre className={`${s.cmd} t-mono`}>{cmd}</pre>
          <Button
            variant="ghost"
            onClick={() =>
              navigator.clipboard?.writeText(cmd).then(
                () => setCopied(true),
                () => {},
              )
            }
          >
            <Icon name={copied ? "checkmark" : "doc.on.doc"} size={14} />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </>
    );
  } else if (tool === "Edit" && (typeof input.old_string === "string" || typeof input.new_string === "string")) {
    body = <Diff oldS={str(input, "old_string") ?? ""} newS={str(input, "new_string") ?? ""} />;
  } else if ((tool === "Write" || tool === "NotebookEdit") && typeof input.content === "string") {
    body = <pre className={`${s.cmd} t-mono`}>{input.content}</pre>;
  } else {
    body = (
      <pre className={`${s.cmd} t-mono`}>
        {JSON.stringify(input, null, 2)}
      </pre>
    );
  }

  return (
    <div className={s.toolDetail}>
      <span className="t-caption">{tool}</span>
      {path && <span className={`${s.path} t-mono`}>{path}</span>}
      {body}
    </div>
  );
}
