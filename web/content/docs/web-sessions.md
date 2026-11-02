# Starting sessions from the web

Start agent sessions from the browser on a machine you control, using the `live` daemon. You need the CLI installed and signed in on that machine, and the agent CLIs installed and signed in there too.

## Run the daemon

```bash
live daemon --dir ~/code/api --dir ~/code/web
```

Leave it running. The machine now shows up in **New session** on the site. Pick the machine, the agent and the directory, and the session starts there. `live hosts` lists your machines that are running the daemon.

Run the daemon as the operating-system user whose agent credentials and projects it should use. A service manager (launchd, systemd) can keep it running.

## Allowed directories

Sessions can only start in the directories you passed with `--dir`. Without `--dir`, only the current directory is allowed. Repeat `--dir` to offer more than one.

## Security model

- Only your account can start sessions on your machine.
- Only Claude Code, Antigravity, Codex, Gemini CLI and Ollama can be started. The browser cannot run arbitrary commands.
- Sessions run as the daemon's user, with that user's file access. The directory list limits where sessions start; it is not a sandbox. Use a dedicated user or container if that matters to you.
- Web-started sessions are normal sessions: same capture, same permission control.

## Take over a web-started session

Each web-started session runs in tmux. To continue it in your terminal:

```bash
tmux -L liveshortly attach -t live-<first 8 characters of the session id>
```
