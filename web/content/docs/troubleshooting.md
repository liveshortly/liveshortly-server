# Troubleshooting

Each message the CLI or the site shows, what causes it, and how to fix it. Start with the log: the CLI writes everything it can't show you to `~/.liveshortly/live.log`, one line per problem, prefixed with the first 8 characters of the session id.

```bash
tail -n 50 ~/.liveshortly/live.log
live whoami
live version
```

## Install and sign-in

### `live: command not found`

**Cause:** the folder the installer used is not on your `PATH` yet.
**Fix:** open a new terminal, or add the folder the installer printed (`/usr/local/bin` or `~/.local/bin`) to `PATH` in your shell profile.

### ``not signed in — run `live login` ``

**Cause:** no credentials for the server the CLI is using.
**Fix:** run `live login`. If it keeps asking, delete `~/.liveshortly/credentials.json` and sign in again. Credentials belong to one server, so sign in again after changing `host.json`.

### ``token: INVALID — run `live login` ``

**Cause:** `live whoami` found credentials the server no longer accepts (signed out elsewhere, or the server's secret changed).
**Fix:** `live logout`, then `live login`.

### ``already signed in as you@example.com — `live logout` first to switch accounts``

**Fix:** `live logout`, then `live login` with the other account.

### The device page says the code is invalid or expired

**Cause:** sign-in codes last 10 minutes and work once.
**Fix:** run `live login` again and use the new code.

### `live: checksum mismatch (got …, want …) — aborting`

**Cause:** the downloaded binary doesn't match its published checksum (a broken download or a proxy that rewrites files).
**Fix:** run the installer or `live update` again. If it keeps failing, download the release by hand and check it (see [Install](/install)).

### ``live: could not replace /usr/local/bin/live: … (try: sudo live update)``

**Fix:** run `sudo live update`, or reinstall to a folder you own.

## Starting a session

### `live: command not found: <agent>`

**Cause:** the agent's own CLI is not on your `PATH`.
**Fix:** install the agent, or check the spelling (`agy`, not `antigravity-cli`).

### `live: could not start session: …`

**Cause:** the server refused the new session or could not be reached. The text after the colon says which. If it mentions live sessions, you already have the maximum number running.
**Fix:** check `live whoami`, end sessions you no longer need with `live stop <id>`, and try again.

### The agent runs but the session page stays empty

**Cause:** uploads are failing.
**Fix:**
- Read `~/.liveshortly/live.log`. Every failed upload is logged with the reason.
- Check that `live whoami` points at the server you are looking at.
- On a self-hosted server behind your own proxy, turn response buffering off (`proxy_buffering off`). Otherwise updates only appear on refresh.

### `live: stream ended (…) — reconnecting in …`

**Cause:** the connection to the server dropped. The CLI reconnects on its own; your agent keeps running. Nothing to do unless it repeats.

## Approvals

### `live: approvals offline — tool call denied: …`

**Cause:** permission control is on and the local `live` process that relays approvals can't answer (it crashed, timed out, or returned something unreadable). Approvals fail closed, so the tool is denied.
**Fix:** end the session and start it again. If it repeats, the reason is after the colon and in `live.log`.

### The agent waits for approval and nobody answers

**Cause:** permission control is on for `live claude`, `live codex`, `live agy` and `live gemini`. Requests wait for an answer and are denied after 8 minutes.
**Fix:** answer from the tmux popup, the session page, or `live join <id>` with `/allow`. To run without it: `live --no-permissions claude`. See [Approvals](/docs/approvals).

### `● live no tmux — approve tool runs from the session page (install tmux for in-terminal popups)`

**Fix:** nothing is wrong. Install tmux (`brew install tmux`, `sudo apt install tmux`) if you want the popup.

### `● live gemini's own prompts approve tools this run: …`

**Cause:** Gemini hooks may not fire in this setup (hooks or extensions disabled, an extension allowlist, an unreadable settings file, GitHub Actions, or you passed `--yolo` or `--approval-mode`).
**Fix:** the reason follows the colon. Fix that setting, or answer in Gemini's own prompt.

### `live agy` exits straight away

**Cause:** the `liveshortly` plugin could not be installed or enabled, and Antigravity is never run ungated.
**Fix:** check `live.log` for the reason. Run with `live --no-permissions agy` to run without approvals.

## Viewer messages

### Messages don't reach the agent

- **Claude Code:** messages arrive at the next prompt, tool call or idle moment. If you answered no when Claude Code asked to load development channels, they only arrive at the next prompt or tool call. Restart `live claude` and answer yes. `● live viewer channel could not load (…) — comments arrive at hook boundaries` means the channel failed; the reason is in brackets.
- **Codex:** needs tmux to receive messages while idle.
- **Gemini CLI:** messages wait for the next tool or turn boundary.
- **Other terminal agents:** messages are shown to the person running the session as a `[live]` line, not typed in. See [Watching & commenting](/docs/watching-and-commenting).

## Joining, forking and handoff

### `no access to that session`

**Cause:** the session is private and you are not invited, or you are signed in with another email.
**Fix:** ask the owner to invite the email shown by `live whoami`.

### `live: you don't have access to hand off this session`

**Cause:** as above, for `live handoff`.

### `--handoff and --session are mutually exclusive`

**Fix:** use one of them.

### `live: no prior context for this session (not a fork?) — looked in …`

**Cause:** `live context` only works in a session started with `--session` or `--handoff`.

### `live ls: -n requires a positive count (or use --all)`

**Fix:** pass a number greater than 0, or `--all`.

## Session state

### A session stays "live" after a crash

**Cause:** the agent stopped reporting without ending the session.
**Fix:** the server ends sessions whose agent has been gone for about 10 minutes. You can end it yourself with `live stop <id>`. The daemon also archives web-started sessions whose capture process died (`● live archived orphaned session …`).

### The session ended with "quota"

**Cause:** you reached your storage limit. `live.log` shows `⚠ Storage full — session archived.` with a **Continue** command.
**Fix:** delete old sessions to free space, then run the **Continue** command to carry on in a new session.

### `live: session stop failed (will be reaped): …`

**Cause:** the CLI couldn't tell the server the session ended (often a network drop at exit).
**Fix:** none needed; the server ends it on its own. `live stop <id>` ends it now.

## Starting sessions from the web

### `live: tmux is required for live daemon`

**Fix:** install tmux, then start the daemon again.

### A machine is missing from New session

**Cause:** `live daemon` is not running, or is signed in to another server.
**Fix:** start it, and check `live whoami`. A machine leaves the list about 90 seconds after its daemon stops. `live hosts` shows which machines the server sees.

### `● live spawn refused: …`

**Cause:** the session asked for something the daemon does not offer: an agent not on its `PATH` (`agent "x" is not offered by this machine`), a directory not passed with `--dir`, or an Ollama model that isn't pulled.
**Fix:** install the agent, restart the daemon with the right `--dir`, or `ollama pull` the model.

### `live: register failed (…) — retrying in …`

**Cause:** the daemon can't reach the server. It keeps retrying. Check the network and `live whoami`.

## Self-hosted servers

### Sign-in fails

**Fix:** check that your Google OAuth client's JavaScript origin and redirect URI match `PUBLIC_ORIGIN` exactly, and that `PUBLIC_SCHEME` matches (`https` for a public server). After changing the origin, rebuild the web image.

### Live updates only appear on refresh

**Fix:** turn off response buffering in your reverse proxy (`proxy_buffering off`). See [Self-hosting](/docs/self-hosting#add-https).

## Still stuck

Open an issue at [github.com/liveshortly/live](https://github.com/liveshortly/live/issues) with the output of `live version`, the agent and its version, and the relevant lines of `~/.liveshortly/live.log`. Check the log for anything private before you paste it.
