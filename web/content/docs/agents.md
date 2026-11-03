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

Claude Code, Codex, Antigravity and Gemini CLI (0.26 and later) are captured as structured events: prompts, tool calls, file diffs and replies. Every other command runs in a pseudo-terminal and the session shows its terminal output.

Any agent your machine's daemon offers can also be started from the web ([New session](/new)); a plain command can only be started from your terminal.

## What works where

This table is generated from the CLI's harness code, so it matches what the current `live` release does.

<!-- harness-matrix:start -->
| Agent | Capture | Approvals | Viewer comments | Model switch | Handoff | Min version | Golden replays | pocket.ai approvals | Known gaps |
|---|---|---|---|---|---|---|---|---|---|
| `claude` | ✅ Claude Code hooks | ✅ gated from the web or tmux popup; fails closed | ✅ injected (channel, hook boundaries, Stop) | ✅ `/model` from the session page | ✅ seed prompt injected | — | claude 2.1.316 | supported | — |
| `codex` | ✅ rollout file, codex in tmux | ✅ gated (PreToolUse hook); fails closed. Off with `--no-permissions`, `--yolo`, `-a never` | ✅ typed into codex's composer | ❌ | ✅ seed prompt injected | — | codex 0.142.5, codex 0.166.0 | supported | no mid-session model switch |
| `codex` (`LIVE_TMUX=0`) | ✅ rollout file, codex in a PTY | ✅ gated (PreToolUse hook); fails closed | ⚠ codex pulls them via the `poll_viewer_messages` channel tool (`LIVE_CHANNEL=0` turns it off) | ❌ | ✅ seed prompt injected | — | codex 0.142.5, codex 0.166.0 | supported | comments wait until codex calls the channel tool; no model switch |
| `codex` (`LIVE_CODEX_APPSERVER=1`) | ✅ app-server JSON-RPC (headless) | ✅ answered from the web; deny on timeout | ✅ steer the running turn, or start a new one | ❌ | ✅ developer instructions | — | codex-appserver 0.166.0 | supported | file approvals say only "apply a file change"; no terminal UI; codex questions get no answers; no model switch |
| `agy`, `antigravity` | ✅ hooks (`liveshortly` plugin) | ✅ gated; fails closed; live exits if the plugin can't install | ✅ every comment in full, at the next model step | ❌ | ✅ seed prompt injected | — | agy 1.4.9 | supported | reply arrives when the turn ends; no model switch |
| `gemini` | ✅ hooks (`liveshortly` extension) | ⚠ gated, fails closed — but gemini's own prompt stays in charge when hooks may not fire (hooks/extensions disabled, allowlist, GitHub Actions, your own `--yolo`/`--approval-mode`) | ⚠ at tool and turn boundaries only | ❌ | ⚠ paste the printed seed prompt | 0.26 | gemini 0.65.0 | unsupported | untrusted folder: approve twice; env redaction strips `LIVE_TOKEN` (capture off, gated tools denied); comments wait while idle; no model switch |
| `gemini` (gemini < 0.26) | ⚠ terminal recording | ❌ gemini's own prompt, in the terminal only | ⚠ shown to the operator only | ❌ | ⚠ paste the printed seed prompt | — | gemini-pty 0.65.0 | unsupported | no structure; upgrade to 0.26+ |
| `ollama` | ⚠ terminal recording, whole lines | — no tools | ✅ typed in as one line | ❌ | ⚠ paste the printed seed prompt | — | ollama 0.30.10 | not-needed | no prompt/tool rows, no stream_end, no model |
| `aider`, `cursor-agent`, `hermes`, `copilot`, `opencode`, `crush`, `goose`, `amp`, `qwen`, `pi` and any other command | ⚠ terminal recording (raw lines, no structure) | ❌ the agent's own prompt, in the terminal only | ⚠ shown to the operator only (opt in to typing with `type_comments` in agents.json or `LIVE_TYPE_COMMENTS=1`) | ❌ | ⚠ paste the printed seed prompt | — | aider 0.82.3, cursor-agent 2026.10.01, hermes 0.21.5 | unsupported | no prompt/reply/tool rows, no stream_end, no model |

✅ works · ⚠ partial (reason given) · ❌ not supported. Generated from `internal/harness` by `go run ./scripts/harnessmatrix`; do not edit by hand.
<!-- harness-matrix:end -->

## Codex and tmux

Codex runs inside tmux so viewer comments can be typed into its input box, which is the only way a comment reaches Codex while it is idle. With `LIVE_TMUX=0` (or no tmux installed), Codex runs in a plain terminal and only picks comments up when it calls the channel tool.

## Messages to an idle Claude

For `live claude`, a per-session channel lets viewer messages reach Claude even while it waits for input. The first time, Claude Code asks whether to load development channels; answer yes. Set `LIVE_CHANNEL=0` to turn it off; messages then arrive at the next hook.
