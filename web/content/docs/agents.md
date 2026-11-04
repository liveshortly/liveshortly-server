# Agents

Which agents work with LiveShortly, what each one supports, and how to set each one up. You need the agent's own CLI installed and signed in; `live` wraps it and does not replace it.

## Supported agents

```bash
live claude                    # Claude Code
live codex                     # Codex
live gemini                    # Gemini CLI
live agy                       # Antigravity CLI
live ollama run llama3         # Ollama
LIVE_ACP=1 live goose acp      # any agent that speaks the Agent Client Protocol
live -- ./scripts/deploy.sh    # any command; -- ends live's own options
```

There are three kinds of capture:

- **Structured** (Claude Code, Codex, Antigravity, Gemini CLI 0.26+, ACP agents): prompts, replies, tool calls and file diffs arrive as separate rows, and approvals and viewer messages work.
- **Terminal recording** (Ollama, Gemini CLI before 0.26, everything else): the session shows what the command printed, one row per line.
- **ACP mode**: any agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com) gets structured capture, even one `live` has never heard of.

Any agent your machine's daemon offers can also be started from the web ([New session](/new)). See [Starting sessions from the web](/docs/web-sessions).

## What works where

This table is generated from the CLI's harness code, so it matches what the current `live` release does.

<!-- harness-matrix:start -->
| Agent | Capture | Approvals | Viewer comments | First message wakes idle agent | Model choice at start | Model switch | Handoff | Min version | Golden replays | pocket.ai approvals | Known gaps |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `claude` | ✅ Claude Code hooks | ✅ gated from the web or tmux popup; fails closed | ✅ injected (channel, hook boundaries, Stop) | ✅ channel push; held until the channel connects | ✅ `--model` (opus, sonnet, haiku, your default) | ✅ `/model` from the session page | ✅ seed prompt injected | — | claude 2.1.316 | supported | — |
| `codex` | ✅ rollout file, codex in tmux | ✅ gated (PreToolUse hook); fails closed. Off with `--no-permissions`, `--yolo`, `-a never` | ✅ typed into codex's composer | ✅ typed into the composer once it is drawn (waits up to 20 s; session notice if it never is) | ✅ `--model` (codex's model list) | ❌ | ✅ seed prompt injected | — | codex 0.142.5, codex 0.166.0 | supported | no mid-session model switch |
| `codex` (`LIVE_TMUX=0`) | ✅ rollout file, codex in a PTY | ✅ gated (PreToolUse hook); fails closed | ⚠ codex pulls them via the `poll_viewer_messages` channel tool (`LIVE_CHANNEL=0` turns it off) | ❌ waits for codex to call `poll_viewer_messages`; an idle codex never does | ✅ `--model` (codex's model list) | ❌ | ✅ seed prompt injected | — | codex 0.142.5, codex 0.166.0 | supported | comments wait until codex calls the channel tool; no model switch |
| `codex` (`LIVE_CODEX_APPSERVER=1`) | ✅ app-server JSON-RPC (headless) | ✅ answered from the web; deny on timeout | ✅ steer the running turn, or start a new one | ✅ starts a turn (held on the server until the thread is open) | ✅ `model` on thread/start | ❌ | ✅ developer instructions | — | codex-appserver 0.166.0 | supported | file approvals say only "apply a file change"; no terminal UI; codex questions get no answers; no model switch |
| `agy`, `antigravity` | ✅ hooks (`liveshortly` plugin) | ✅ gated; fails closed; live exits if the plugin can't install | ✅ every comment in full, at the next model step | ✅ typed in once the composer is ready (waits up to 20 s, confirms, retries once; notice names trust/sign-in) | ✅ `--model` (`agy models`) | ❌ | ⚠ prior context shown in the pane and saved as a digest; agy has no system-prompt flag and `-i` would start a turn, so it isn't given to agy | — | agy 1.4.9 | supported | reply arrives when the turn ends; no model switch |
| `gemini` | ✅ hooks (`liveshortly` extension) | ⚠ gated, fails closed — but gemini's own prompt stays in charge when hooks may not fire (hooks/extensions disabled, allowlist, GitHub Actions, your own `--yolo`/`--approval-mode`) | ✅ typed into the composer while idle; at tool and turn boundaries while busy (tmux runs; without tmux, boundaries only) | ✅ typed in once gemini is idle at its composer (waits up to 20 s, confirms, retries once; notice names trust/sign-in); mid-turn it waits for the next hook | ✅ `--model` (shipped list + your default) | ❌ | ⚠ not given to the agent — prior context shown in the terminal and saved as a digest file | 0.26 | gemini 0.65.0 | unsupported | untrusted folder: approve twice; env redaction strips `LIVE_TOKEN` (capture off, gated tools denied); without tmux comments wait while idle; no model switch |
| `gemini` (gemini < 0.26) | ⚠ terminal recording | ❌ gemini's own prompt, in the terminal only | ⚠ shown to the operator only | ❌ shown to the operator only | ✅ `--model` (shipped list + your default) | ❌ | ⚠ not given to the agent — prior context shown in the terminal and saved as a digest file | — | gemini-pty 0.65.0 | unsupported | no structure; upgrade to 0.26+ |
| `ollama` | ⚠ terminal recording, whole lines | — no tools | ✅ typed in as one line | ✅ typed in as one line once ollama is idle at its prompt; an early one waits for it | ✅ `ollama run <model>` (pulled models; required) | ❌ | ⚠ not given to the agent — prior context shown in the terminal and saved as a digest file | — | ollama 0.30.10 | not-needed | no prompt/tool rows, no stream_end, no model |
| `any ACP agent` (`LIVE_ACP=1` or `"acp": true` in agents.json) | ✅ Agent Client Protocol over stdio (headless) | ✅ answered from the web; fails closed | ✅ sent as the next turn (queued while one runs) | ✅ sent as the first turn (held on the server until the ACP session is open) | ⚠ only via `models` + `model_flag` in agents.json | ❌ | ✅ digest prepended to the first turn | ACP protocol v1 | acp 1 | unsupported | no terminal UI; comments wait for the running turn; no model switch |
| `aider`, `cursor-agent`, `hermes`, `copilot`, `opencode`, `crush`, `goose`, `amp`, `qwen`, `pi` and any other command | ⚠ terminal recording (raw lines, no structure) | ❌ the agent's own prompt, in the terminal only | ⚠ typed in at the agent's prompt when it is idle (the named agents; any other command only with `type_comments` in agents.json or `LIVE_TYPE_COMMENTS=1`) | ⚠ typed in once output is quiet and no dialog is on screen (echo confirmed, Enter retried once; session notice after 20 s). A heuristic, not yet checked per agent; `ready_pattern` in agents.json pins the prompt | ⚠ `cursor-agent` (`--model`), or any agent given `models` + `model_flag` in agents.json | ❌ | ⚠ not given to the agent — prior context shown in the terminal and saved as a digest file | — | aider 0.82.3, cursor-agent 2026.10.01, hermes 0.21.5 | unsupported | no prompt/reply/tool rows, no stream_end, no model. Speaks ACP? Run it in ACP mode (row above) |

✅ works · ⚠ partial (reason given) · ❌ not supported. Generated from `internal/harness` by `go run ./scripts/harnessmatrix`; do not edit by hand.
<!-- harness-matrix:end -->

## Claude Code

```bash
live claude
```

- Captured through Claude Code's lifecycle hooks, passed in a temporary settings file. Nothing in your own Claude settings is changed.
- The first run asks whether to load development channels. Answer yes: it lets viewer messages reach Claude while it is idle. `LIVE_CHANNEL=0` turns the channel off; messages then arrive at the next prompt or tool call.
- Permission control is on. tmux gives you an in-terminal popup; without it you answer on the session page. Your Claude allowlist does not apply while it is on.
- The owner can switch the model with `/model` from the session page.
- `claude -p` / `--print` runs are captured but never gated.

## Codex

```bash
live codex
```

- Read from Codex's own rollout file, with Codex running inside tmux. tmux is required for viewer messages to reach an idle Codex: they are typed into its input box.
- Without tmux (or with `LIVE_TMUX=0`), Codex runs in a plain terminal and fetches messages through a `poll_viewer_messages` tool when it finishes a step.
- `LIVE_CODEX_APPSERVER=1 live codex` drives Codex headless over its app-server protocol: no terminal UI, you steer and approve from the session page.
- Approvals are on through a PreToolUse hook. `--yolo`, `--dangerously-bypass-approvals-and-sandbox`, `-a never` or `LIVE_CODEX_PERMS=0` turn them off.

## Gemini CLI

```bash
live gemini
```

- Gemini CLI 0.26 or later is captured through a `liveshortly` extension that `live` installs in `~/.gemini/extensions`. It does nothing outside `live`. `live uninstall` removes it.
- Gemini older than 0.26 is recorded as terminal output. Upgrade for structured capture.
- Viewer messages arrive at tool and turn boundaries only.
- If Gemini's environment redaction is on, it strips `LIVE_TOKEN` from hooks: capture stops and gated tools are denied. Turn redaction off for `LIVE_*` variables, or run with `--no-permissions`.
- See [Approvals](/docs/approvals#per-agent) for when Gemini's own prompt stays in charge.

## Antigravity

```bash
live agy        # or: live antigravity
```

- Captured through a `liveshortly` plugin that `live` installs. If the plugin can't be installed, `live agy` exits rather than run without approvals.
- Every viewer message reaches the agent in full at its next model step. The reply arrives when the turn ends.

## Ollama

```bash
live ollama run llama3
```

- Recorded as terminal output, released one whole line at a time. Ollama has no tools, so there is nothing to approve.
- Viewer messages are typed in as one line.

## Any ACP agent

Agents that speak the Agent Client Protocol get structured capture, web approvals and message delivery, including agents released after your `live` version. Run the agent's ACP entry point with `LIVE_ACP=1`:

```bash
LIVE_ACP=1 live goose acp
LIVE_ACP=1 live gemini --experimental-acp
```

You should see:

```text
● live ACP agent connected — watch, message, and approve from the session page. Ctrl-C to end.
● live send the first instruction from the session page to begin.
```

- The session is headless: there is no terminal UI. Send instructions from the session page; each viewer message is the next turn, queued while one runs.
- Permission requests are answered on the web and fail closed.
- For web-started sessions, add `"acp": true` to the agent's entry in `~/.liveshortly/agents.json` (see [Starting sessions from the web](/docs/web-sessions#which-agents-are-offered)).
- If the agent does not speak ACP with those arguments, `live` says so: `live: acp: … (does goose speak ACP with these arguments?)`.

## Other terminal agents

```bash
live aider
live cursor-agent
live -- ./scripts/deploy.sh
```

- Recorded as terminal output. No prompt, reply or tool rows.
- Approvals stay in the agent's own terminal prompt.
- Viewer messages are shown to you as a yellow `[live]` line. To type them into the agent instead, set `"type_comments": true` in `agents.json` or `LIVE_TYPE_COMMENTS=1`.
- If the agent speaks ACP, run it in ACP mode for structured capture.

## If it doesn't work

- **`live: command not found: <agent>`**: the agent is not on your `PATH`.
- **Codex messages only arrive after a step**: install tmux.
- **Claude ignores messages while idle**: you declined development channels. Restart and answer yes.
- **Gemini shows raw terminal output**: upgrade Gemini CLI to 0.26 or later.
- **`live: acp: …`**: the agent did not start in ACP mode. Check its ACP arguments.

More in [Troubleshooting](/docs/troubleshooting).
