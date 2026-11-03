# Starting sessions from the web

Start agent sessions from the browser on a machine you control, using the `live` daemon. You need the `live` CLI installed and signed in on that machine, tmux installed, and the agent CLIs installed and signed in there too. Sessions run on your machine, not on the server.

## 1. Run the daemon

```bash
live daemon --dir ~/code/api --dir ~/code/web
```

You should see:

```text
● live daemon ready as alice-mbp — start sessions from https://liveshortly.com
```

Leave it running. The machine now shows up in **New session** on the site. `live hosts` lists your machines that are running the daemon.

Run the daemon as the operating-system user whose agent credentials and projects it should use. A service manager (launchd on macOS, systemd on Linux) can keep it running. `--name` changes the name shown on the site; without it the hostname is used.

## 2. Start a session from the browser

1. Choose **New session** on the site.
2. Pick the machine, the agent and the directory. For Ollama, pick a model that is already pulled on that machine.
3. Leave **Skip permission prompts** off unless you trust the agent in that directory (see below).
4. Start it. The session page opens and the daemon prints:

```text
● live started claude in /Users/alice/code/api → https://liveshortly.com/session/3f2a9c1e-…
        attach locally: tmux -L liveshortly attach -t live-3f2a9c1e
```

Send your first instruction from the message box on the session page.

## Allowed directories

Sessions can only start in the directories you passed with `--dir`. Without `--dir`, only the directory you started the daemon in is allowed. Repeat `--dir` to offer more than one. The server sends only an agent name and one of these directories; your machine builds the command.

## Which agents are offered

The daemon offers every agent it finds on its `PATH` from this list: `claude`, `codex`, `gemini`, `agy`, `antigravity`, `ollama`, `aider`, `cursor-agent`, `copilot`, `opencode`, `crush`, `goose`, `amp`, `qwen`, `pi`, `hermes`. To offer anything else, or an agent installed under another name or path, list it in `~/.liveshortly/agents.json`:

```json
[
  { "name": "my-agent", "command": "/opt/my-agent/bin/agent", "args": ["--interactive"] },
  { "name": "goose", "command": "goose", "args": ["acp"], "acp": true },
  { "name": "aider", "command": "aider", "type_comments": true }
]
```

| Field | Meaning |
| --- | --- |
| `name` | The name shown in the picker. Letters, digits, `-` and `_`. It can't reuse a built-in name (`claude`, `codex`, `gemini`, `agy`, `antigravity`, `ollama`). |
| `command` | The executable. Defaults to `name`. |
| `args` | Fixed arguments, always passed. |
| `type_comments` | Type viewer messages into the agent as one line. Off by default, because the Enter that submits the line can also answer a yes/no prompt in the agent. |
| `acp` | Run the agent over the Agent Client Protocol. `command` and `args` must start its ACP mode. The session gets structured capture and web approvals. |

A file that exists but does not parse stops the daemon from starting. At most 64 entries. Use `--agents-file <path>` to read another file.

## Skip permission prompts

Off by default: you approve each tool call from the session page, as in [Approvals](/docs/approvals). Turning it on runs the agent without asking, with its own "don't ask" flag:

| Agent | With skip on |
| --- | --- |
| Claude Code | `--dangerously-skip-permissions` |
| Gemini CLI | `--yolo` |
| Codex | `--ask-for-approval never`. Codex keeps its sandbox: anything outside it fails instead of asking. |
| Antigravity, ACP agents | `live`'s approvals are off; no extra flag is passed. |
| Other terminal agents | No flag is passed. |

Terminal agents such as aider or cursor-agent can't be approved from the web. They use their own terminal prompts, which nobody can answer in a web-started session. The picker says so. Turn **Skip permission prompts** on for them, or start them from your terminal instead.

## Take over a web-started session

Each web-started session runs in tmux on your machine. To continue it in your terminal:

```bash
tmux -L liveshortly attach -t live-<first 8 characters of the session id>
```

ACP sessions have no terminal; use the session page.

## Clean-up

- Restarting the daemon does not stop running sessions.
- Every 5 minutes, and when it starts, the daemon looks for web-started sessions whose capture process has died (reboot, crash, `kill -9`) and ends them on the server: `● live archived orphaned session …`. The tmux pane is left running so you can still attach to it.
- A machine leaves the **New session** list about 90 seconds after its daemon stops.
- Ending the session from the page (or `live stop <id>`) stops capture. Close the agent itself in its tmux pane if it is still open.

## Security model

- Only your account can start sessions on your machine.
- The browser can't run arbitrary commands: it can only choose an agent the daemon offered and a directory you allowed.
- Sessions run as the daemon's user, with that user's file access. The directory list limits where sessions start; it is not a sandbox. Use a dedicated user or container if that matters to you.
- Web-started sessions are normal sessions: same capture, same permission control, same sharing.

## If it doesn't work

- **``live: tmux is required for `live daemon` ``**: install tmux (`brew install tmux` or `sudo apt install tmux`).
- **The machine is missing from New session.** The daemon must be running and signed in to the same server. Check `live whoami` and `live hosts`.
- **`spawn refused: agent "x" is not offered by this machine`**: the agent is not on the daemon's `PATH`. Install it, or add it to `agents.json`, then restart the daemon.
- **`spawn refused: directory "…" is not registered on this machine`**: restart the daemon with that `--dir`.
- **`spawn refused: model "…" is not pulled on this machine`**: run `ollama pull <model>` on that machine.
- **`live: register failed (…) — retrying in …`**: the daemon can't reach the server. It keeps retrying.
- **The agent exits straight away.** It is not signed in on that machine, or it is waiting for a prompt nobody can answer. Attach with tmux to see why.

## Related

- [Approvals](/docs/approvals)
- [Agents](/docs/agents)
- [PocketAI apps](/docs/pocketai): a separate daemon mode for the PocketAI app.
