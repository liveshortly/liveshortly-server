# PocketAI apps

Use the PocketAI apps for iPhone and Mac to run agents on your own machine and approve their tool runs from your phone. You need a machine with `live` and your agent CLIs installed.

## Start the daemon in server mode

```bash
export LIVE_POCKET_KEY="$(openssl rand -hex 32)"
live daemon --server --dir /absolute/path/to/project
```

The daemon listens on port 8787 on all interfaces. Use `--listen` to change that, `--name` to change the displayed server name, and repeat `--dir` for more projects. Keep the key; the app needs it.

This mode does not need the web platform, Google sign-in, Postgres or Redis. It is a separate API from the web platform: the key is not a web login, and the app's direct-daemon setting does not accept the web platform's URL.

## Connect the app

1. In PocketAI, choose **LiveShortly**.
2. Enter the server address (for example `http://your-mac.local:8787`) and the key.
3. Tap **Test connection**, pick an agent and a project, and save.

The app lists the agents found on the machine (Codex, Claude, Gemini, Antigravity, Ollama, Aider, Cursor Agent) and the local Ollama models.

## Approve from your phone

For Claude, Codex and Antigravity, each tool run waits for you in the chat. The app shows the full tool input with **Approve once** and **Deny**. Requests expire after 8 minutes; stopping the turn or restarting the daemon denies them. Gemini, Cursor, Aider and custom agents keep their own permission behaviour; the app shows which agents support phone approvals.

## Keep it secure

- Use HTTPS (`--tls-cert` and `--tls-key`, or a TLS proxy) or a private network. Over plain HTTP the key is sent unencrypted.
- The key gives access to every session on the daemon. Restart with a new key to revoke access.
- Agents run as the daemon's user. Use a dedicated user or container for people you don't fully trust.
