# Watching & commenting

Watch a session live in the browser or the terminal, and send messages to the agent while it runs. You need read access to the session (see [Sharing & visibility](/docs/sharing)); sending messages needs comment access and a signed-in account.

## What viewers see

The session page shows the session as a feed of rows, newest at the bottom:

- **Prompts:** what the person running the agent typed.
- **Replies:** the agent's answers, in full.
- **Tool calls:** the command or tool the agent ran, and its output.
- **File changes:** the file path and a diff, with added and removed line counts.
- **Viewer messages:** messages people sent, with who sent them.
- **Permission requests:** a **Permission requested** bar when the agent is waiting for approval (see [Approvals](/docs/approvals)).

How much structure you get depends on the agent. Claude Code, Codex, Antigravity, Gemini CLI 0.26+ and ACP agents produce all of the rows above. Ollama and other terminal agents produce their terminal output, one row per line. The full table is in [Agents](/docs/agents).

People who open the page late see everything from the start, then the new rows as they arrive. When the session ends, the page becomes a replay of the full event log at the same link.

If you are not the owner, local details are hidden from what you see: home-directory paths become `~`, email addresses become `[email]`, and `*.local` hostnames become `[host]`. The owner sees the original text.

## Send a message to the agent

1. Open the session page while the session is live.
2. Type in **Message this session…** at the bottom of the page.
3. Press Enter (Shift-Enter adds a new line).

Your message appears in the feed for everyone watching and is delivered once to the agent. While you type, other viewers see a "… is typing" line under the message box. Typing status is not saved and is not part of the replay.

A message never interrupts the agent in the middle of a step. When and how it arrives depends on the agent:

| Agent | How the message arrives |
| --- | --- |
| Claude Code | Injected into Claude's context at the next pause: a prompt, a tool call, the end of a turn, or while Claude is idle (through a per-session channel). |
| Codex (default, in tmux) | Typed into Codex's input box, so it arrives even while Codex is idle. |
| Codex with `LIVE_TMUX=0` | Codex fetches messages through a `poll_viewer_messages` tool when it finishes a step. |
| Codex with `LIVE_CODEX_APPSERVER=1` | Steers the running turn, or starts a new turn. |
| Antigravity | Every message in full, at the agent's next model step. |
| Gemini CLI 0.26+ | At tool and turn boundaries only; a message sent while Gemini is idle waits for the next one. |
| ACP agents (`LIVE_ACP=1`) | Sent as the next turn, queued while a turn is running. |
| Ollama | Typed in as one line. |
| Other terminal agents | Shown to the person running the session as a yellow `[live]` line in their terminal. They decide whether to pass it on. |

The operator of a terminal agent can opt in to typing messages into it with `"type_comments": true` in `~/.liveshortly/agents.json` or `LIVE_TYPE_COMMENTS=1`. It is off by default because the Enter that submits the line could answer a yes/no prompt in the agent.

## Read-only states

The message box is replaced by a line explaining why you can't send:

| You see | Why |
| --- | --- |
| Session ended — read only. | The agent has exited. The page is now a replay. |
| Watching as a guest. Sign in to comment | You are watching an open session without signing in. |
| Read only — you can watch but not comment. | You have viewer access only. The owner can give you comment access. |
| Waiting for @owner to approve · you can watch | A permission request is pending and only the owner can answer it on the web. |

## Watch from the terminal

```bash
live ls --live      # sessions running now
live join <id>      # watch and send messages
live watch <id>     # watch only
```

`<id>` is the 8-character handle shown by `live ls`, a full session id, or a pasted session link. `live join` prints the last 20 turns, then streams new ones:

```text
 › Rohit Sehgal · you 08:31:32
   append a line 'v2 tui' to README.md, then run wc -l

 ▸ Bash  08:31:35
   git status --short
   ⎿ ?? README.md

 ◆ claude-opus-5 · agent 08:33:17
   Status: `?? README.md` (untracked). Line `v2 tui` appended.

[4m · 2◉] ❯
```

The prompt at the bottom shows the session's uptime and how many people are watching. While the agent works it shows a spinner (`⠹ Claude is working…`). Anything you type goes to the agent, the same as the web message box. `↑`/`↓` recall what you sent, `Ctrl-U` clears the line, `Ctrl-C` leaves. Piping works too: `echo "ship it" | live join <id>`.

Use `--full` for the whole history or `-n <count>` for a set number of turns.

While joined, these slash commands work: `/allow`, `/deny`, `/always`, `/info`, `/who`, `/tail`, `/url`, `/fork`, `/stop`, `/quit`. `/help` lists them.

## If it doesn't work

- **The message box is missing.** See [Read-only states](#read-only-states).
- **Claude never sees messages while idle.** You answered no when Claude Code asked to load development channels. Restart `live claude` and answer yes. With `LIVE_CHANNEL=0` the terminal shows `● live viewer channel OFF (LIVE_CHANNEL=0) — comments arrive at hook boundaries`.
- **Codex only sees messages after a step.** tmux is not installed, so Codex runs without it. Install tmux and restart.
- **A terminal agent ignores messages.** That is expected: they are shown to the operator, not typed in. See the table above.
- **`live join: invalid history count "x"`**: `-n` needs a positive number.

More in [Troubleshooting](/docs/troubleshooting).

## Related

- [Approvals](/docs/approvals)
- [Sharing & visibility](/docs/sharing)
- [Agents](/docs/agents)
