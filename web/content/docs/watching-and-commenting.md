# Watching & commenting

Watch a session live in the browser or the terminal, and send messages to the agent while it runs. You need read access to the session; sending messages needs comment access.

## What viewers see

The session page shows prompts, tool calls, file diffs and agent replies as they happen. People who open the page late see everything from the start, then the live events. When the session ends, the page becomes a replay of the full event log.

## Send a message to the agent

Type in the box at the bottom of the session page. Your message appears for everyone watching and is delivered once to the agent:

- **Claude Code and Antigravity:** the message reaches the agent at its next pause (a prompt, a tool call, or while it waits for input), so it can react mid-task.
- **Other agents (terminal capture):** the message is shown to the person running the session as a `[live]` line in their terminal. They decide whether to pass it on.

A message does not interrupt the agent in the middle of a step.

## Watch from the terminal

```bash
live ls --live      # sessions running now
live join <id>      # watch and send messages
live watch <id>     # watch only
```

`<id>` is the 8-character handle shown by `live ls`, a full session id, or a pasted session link. `live join` prints the last 20 turns, then streams new ones. Anything you type goes to the agent, the same as the web message box. Use `--full` for the whole history or `-n <count>` for a set number of turns.

While joined, these slash commands work: `/allow`, `/deny`, `/always`, `/info`, `/who`, `/tail`, `/url`, `/fork`, `/stop`, `/quit`. `/help` lists them.
