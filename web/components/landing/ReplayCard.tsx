import Link from "next/link";
import { frameworkLabel } from "@/lib/utils";
import type { Replay } from "./replay";
import s from "./Landing.module.css";

const WHO = { you: "Prompt", agent: "Agent", tool: "" } as const;

/** A real public session, played back line by line (CSS only, so the whole
 *  transcript is in the server HTML). Click opens the full session. */
export default function ReplayCard({ replay }: { replay: Replay }) {
  const agent = frameworkLabel(replay.framework);
  return (
    <Link href={`/session/${replay.id}`} className={s.replay}>
      <div className={s.replayBar}>
        <span className={s.replayTag}>▶ Replay</span>
        <span className={s.replayTitle}>{replay.title || "Untitled session"}</span>
      </div>
      <ol className={s.replayLines} aria-label={`Transcript of ${replay.title}`}>
        {replay.lines.map((l, i) => (
          <li
            key={i}
            className={s[l.kind]}
            style={{ "--i": i } as React.CSSProperties}
          >
            {WHO[l.kind] && <span className={s.who}>{WHO[l.kind]}</span>}
            {l.text}
          </li>
        ))}
      </ol>
      <div className={s.replayFoot}>
        <span>
          @{replay.owner_handle}
          {agent !== "—" ? ` · ${agent}` : ""}
          {replay.model ? ` · ${replay.model}` : ""}
        </span>
        <span className={s.replayOpen}>Watch the full session →</span>
      </div>
    </Link>
  );
}
