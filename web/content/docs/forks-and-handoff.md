# Forks & handoff

Continue any session you can read as a new session that you own, with any agent. The original session is not changed. You need read access to the source session.

## Fork by session id

```bash
live claude --session <id>
```

This starts a new session owned by you, continuing from the source session's latest state. It works with any agent, for example `live gemini --session <id>`.

## Hand off with a code

The owner (or anyone who can read the session) creates a handoff code pinned to the current point in the session:

```bash
live handoff <id>
```

It prints a command to copy, such as:

```bash
live claude --handoff ho_...
```

Handoff codes last 7 days. The person who uses the code still needs read access to the source session; a private, unshared session returns "no access".

## What the new agent knows

When the fork starts, the server builds a summary of the source session from its event log (no AI model is involved) and gives it to the new agent, so it can pick up where the session left off.

- The history is printed in the agent's terminal. Scroll up to read it, press Ctrl-B h for a popup, or run `live context` from another shell.
- `--pre-digest` shortens the context with `claude -p` before the agent starts.

On the web, a forked session shows the source's history in a **Prior context** block above its own events. Nothing is copied: access to the source is checked again each time. If you lose access, the history is hidden; if the source is deleted, only a reference remains.
