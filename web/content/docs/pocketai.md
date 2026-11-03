# PocketAI apps

Use the PocketAI apps for iPhone and Mac to run agents on your own machine and approve their tool runs from your phone. PocketAI is made by LiveShortly; see [pocket.liveshortly.com](https://pocket.liveshortly.com). You need a machine with `live` and your agent CLIs installed and signed in, and a network path from your phone to that machine.

## Two ways to use PocketAI

| You want | Use |
| --- | --- |
| Chat with an agent on your machine from the app, with no account | `live daemon --server` and a shared key (this page) |
| Watch and approve `live` sessions from your phone | The session page on liveshortly.com or your server, in the phone's browser. See [Approvals](/docs/approvals#answer-from-your-phone) |

The two are separate. The daemon key is not a web login, and the app's direct-daemon setting does not accept the web platform's URL.

## 1. Start the daemon in server mode

```bash
export LIVE_POCKET_KEY="$(openssl rand -hex 32)"
live daemon --server --dir /absolute/path/to/project
```

You should see:

```text
live daemon · alice-mbp · listening on [::]:8787
Agents: claude, codex, gemini, ollama
Workspaces: /absolute/path/to/project
```

The daemon listens on port 8787 on all interfaces. Use `--listen` to change that, `--name` to change the displayed server name, and repeat `--dir` for more projects. `--key` works instead of `LIVE_POCKET_KEY`. Keep the key; the app needs it.

This mode does not need the web platform, Google sign-in, Postgres or Redis. Sessions are stored on the machine in `~/.liveshortly/pocket/liveshortly-pocket` (change it with `--state-dir`) and survive restarts.

## 2. Connect the app

1. In PocketAI, choose **LiveShortly**.
2. Enter the server address (for example `http://your-mac.local:8787`) and the key.
3. Tap **Test connection**. The app lists the agents found on the machine and the Ollama models pulled there.
4. Pick an agent and a project, and save.

The daemon looks for Codex, Claude, Gemini, Antigravity (`agy`), Ollama, Aider and Cursor Agent on its `PATH`. It does not check that each agent is signed in or has quota left. Ollama sessions need a model that is already pulled; the app never downloads one.

To offer another CLI, list it in a JSON file and pass `--agents-file`:

```json
[{ "name": "my-agent", "command": "/path/to/my-agent", "args": ["--print"] }]
```

The adapter gets the prompt on standard input and must print its answer. An argument containing `{prompt}` receives the prompt instead. No shell is used, and the app can't supply commands or arguments.

## 3. Approve from your phone

For Claude, Codex and Antigravity, each tool run waits for you in the chat. The app shows the full tool input with **Approve once** and **Deny**.

- Requests expire after 8 minutes and are then denied.
- Stopping the turn or restarting the daemon denies any open request.
- A request that can't reach the app (relay failure, bad input, timeout) is denied.
- Codex runs with on-request approvals and its workspace-write sandbox.

Per agent:

| Agent | Phone approvals |
| --- | --- |
| Claude Code | Supported |
| Codex | Supported |
| Antigravity | Supported. If its hook plugin can't be installed, the agent is not started. |
| Ollama | Not needed (no tools) |
| Gemini CLI, Cursor Agent, Aider, ACP agents, custom adapters | Not supported: the agent's own permission behaviour applies |

The app shows which agents support phone approvals in its connection settings.

## Limits

One running turn per session and four in total, 200 sessions, 50 turns per session, 32,000-byte messages, 256 KiB of output and a 15-minute timeout per turn. The most recent 96 KB of the conversation is replayed to the agent at each turn.

## Keep it secure

- Use HTTPS (`--tls-cert` and `--tls-key`, or a TLS proxy) or a private network such as a VPN. Over plain HTTP the key is sent unencrypted.
- The key gives access to every session on the daemon. Restart with a new key to revoke access.
- Agents run as the daemon's user. The project list is not a sandbox: use a dedicated user or container for people you don't fully trust.

## If it doesn't work

- **Test connection fails.** Check that the phone can reach the machine (same network or VPN), the port (8787 by default) is open in the machine's firewall, and the key matches.
- **An agent is missing from the list.** It is not on the daemon's `PATH`. Install it and tap **Test connection** again.
- **Ollama can't start.** Pull the model on the machine first (`ollama pull llama3`).
- **A turn says "interrupted".** The daemon restarted during the turn. Send the message again.
- **The app rejects the web address.** The direct-daemon setting needs the daemon's address (port 8787), not liveshortly.com.

For help with the app, write to [support@pocket.liveshortly.com](mailto:support@pocket.liveshortly.com).

## Related

- [Starting sessions from the web](/docs/web-sessions)
- [Approvals](/docs/approvals)
