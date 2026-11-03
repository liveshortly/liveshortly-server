# Forks & handoff

Continue any session you can read as a new session that you own, with the same agent or a different one. The original session is not changed. You need read access to the source session and the `live` CLI signed in to the same server.

## Fork by session id

```bash
live claude --session <id>
```

This starts a new session owned by you, continuing from the source session's latest state. `<id>` is the 8-character handle from `live ls`, a full session id, or a pasted session link. It works with any agent:

```bash
live codex --session <id>
live gemini --session <id>
```

You should see:

```text
● live continuing from fix flaky auth test (@alice)
● live streaming → https://liveshortly.com/session/9b1c…
```

## Hand off with a code

A handoff code is pinned to one point in the session, so whoever uses it starts from exactly there, even if the session carries on.

1. Anyone who can read the session creates a code:

   ```bash
   live handoff <id>
   ```

2. The CLI prints the command to run, already set to the session's own agent:

   ```text
   live codex --handoff ho_eyJ…
   ```

3. Send that line to whoever should continue. They run it on their machine.

The same command is under **Continue in your terminal** in the session's share sheet.

Handoff codes last 7 days. A code is not a pass: the person who uses it still needs read access to the source session. A private, unshared session returns "no access".

## The command per agent

`live handoff` picks the agent the session was captured with:

| Source session | Printed command |
| --- | --- |
| Claude Code | `live claude --handoff ho_…` |
| Codex | `live codex --handoff ho_…` |
| Gemini CLI | `live gemini --handoff ho_…` |
| Antigravity | `live agy --handoff ho_…` |
| Ollama | `live ollama run <model> --handoff ho_…` |
| Any other agent or command | `live claude --handoff ho_…` |

You can change the agent word before running it, for example to continue a Codex session in Claude Code.

## What the new agent knows

When the fork starts, the server builds a digest of the source session from its event log. No AI model is involved: it is the session's own prompts, replies, tool calls and file changes, put in order.

The digest contains:

- a header with the source title, author, agent, model, git remote and branch, status, start time and the point the fork was taken from;
- the most recent turns in full;
- older turns shortened to one line each, and the oldest dropped if the digest is still too long (about 40 KB). The terminal says so: `● live the prior context was long; the digest keeps the most recent turns (truncated)`.

If you can read the session but don't own it, the digest is redacted the same way as a published session: home paths become `~`, emails `[email]`, `*.local` hosts `[host]`.

How the digest reaches the agent:

| Agent | How it gets the digest |
| --- | --- |
| Claude Code, Codex, Antigravity | Injected as the seed prompt. The agent opens with the context loaded and waits for your first message. |
| Codex app-server mode | Passed as developer instructions. |
| ACP agents | Prepended to the first turn. |
| Gemini CLI, Ollama, other terminal agents | `live` prints a line to paste: `● live paste this to orient your agent:` |

The history is also printed in the agent's terminal. Scroll up to read it, press Ctrl-B h for a popup, or run `live context` from another shell. `--pre-digest` shortens the context with `claude -p` before the agent starts.

On the web, a forked session shows the source's history in a **Prior context** block above its own events. Nothing is copied: access to the source is checked again each time. If you lose access, the history is hidden; if the source is deleted, only a reference remains.

## When storage is full

If your account reaches its storage limit during a session, the server ends the session and `~/.liveshortly/live.log` records how to continue:

```text
⚠ Storage full — session archived.
   Summary:  https://liveshortly.com/…/summary.md
   Continue: live claude --handoff ho_…
```

Delete old sessions to free space, then run the **Continue** command.

## If it doesn't work

- **`live: could not fork session: no access to that session`**: you can't read the source. Ask the owner to invite you.
- **`live: you don't have access to hand off this session`**: same, for `live handoff`.
- **`live: could not create handoff: …`**: the server refused or could not be reached. Check `live whoami`.
- **`--handoff and --session are mutually exclusive`**: use one or the other.
- **The code stopped working.** Codes expire after 7 days. Create a new one.
- **`live: no prior context for this session (not a fork?)`**: `live context` only works inside a forked session.

## Related

- [Sharing & visibility](/docs/sharing)
- [Agents](/docs/agents)
