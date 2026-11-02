# Agents

Which agents work with LiveShortly and what each one supports.

## Supported agents

```bash
live claude        # Claude Code
live agy           # Antigravity CLI
live codex         # Codex
live gemini        # Gemini CLI
live ollama run llama3
live -- ./scripts/deploy.sh   # any command; -- ends live's own flags
```

Claude Code and Antigravity are captured through their lifecycle hooks, so the session shows structured events: prompts, tool calls, file diffs and replies. Every other command runs in a pseudo-terminal and the session shows its terminal output.

## What works where

| Agent | Capture | Messages from viewers | Approvals | Start from the web |
| --- | --- | --- | --- | --- |
| Claude Code (`live claude`) | Hooks: prompts, tools, diffs, replies | Delivered to the agent | Yes | Yes |
| Antigravity (`live agy`) | Hooks: prompts, tools, diffs, replies | Delivered to the agent | Yes | Yes |
| Codex (`live codex`) | Terminal output | Typed into its composer (needs tmux) | Codex's own prompts | Yes |
| Gemini CLI (`live gemini`) | Terminal output | Shown to you | Gemini's own prompts | Yes |
| Ollama (`live ollama ...`) | Terminal output | Shown to you | No | Yes |
| Any other command | Terminal output | Shown to you | No | No |

## Codex needs tmux

Codex runs inside tmux so viewer messages can be typed into its input box, which is the only way a message reaches Codex while it is idle. Without tmux, messages only arrive if Codex happens to check for them.

## Messages to an idle Claude

For `live claude`, a per-session channel lets viewer messages reach Claude even while it waits for input. The first time, Claude Code asks whether to load development channels; answer yes. Set `LIVE_CHANNEL=0` to turn it off; messages then arrive at the next hook.
