# Troubleshooting

Fixes for common problems with the CLI, sessions and self-hosted servers.

## `live: command not found`

The installer puts `live` in a directory that may not be on your `PATH` yet. Open a new terminal, or add the directory the installer printed to `PATH` in your shell profile.

## "not signed in"

Run `live login`. If it keeps asking, delete `~/.liveshortly/credentials.json` and sign in again. Credentials belong to one server, so sign in again after changing `host.json`.

## Nothing shows up on the session page

- Check `~/.liveshortly/live.log`. Every failed upload is logged there with the reason.
- Check `live whoami` points at the server you are looking at.
- On a self-hosted server behind your own proxy, make sure response buffering is off (`proxy_buffering off`). Otherwise live updates only appear on refresh.

## A session stays "live" after a crash

The server ends sessions whose agent has gone quiet. You can also end it yourself with `live stop <id>`.

## Viewer messages don't reach the agent

- Claude Code: the message arrives at the next prompt, tool call or idle moment. If you answered no when Claude Code asked to load development channels, messages only arrive at the next prompt or tool call. Restart `live claude` and answer yes.
- Codex needs tmux to receive messages while idle.
- Other agents show messages to the person running the session; they are not typed into the agent.

## The agent waits for approval and nobody answers

Permission control is on for `live claude` and `live agy`. Answer from the tmux popup, the session page, or `live join` with `/allow`. Requests are denied after about 8 minutes. To run without it: `live --no-permissions claude`.

## A machine is missing from New session

`live daemon` must be running and signed in to the same server. A machine leaves the list about 90 seconds after its daemon stops. `live hosts` shows which machines the server sees.

## The session ended with "quota"

You reached your storage limit. The CLI prints a handoff command; run it to continue in a new session. Delete old sessions to free space, or ask your server operator to raise the limit.

## Sign-in fails on a self-hosted server

Check that your Google OAuth client's JavaScript origin and redirect URI match `PUBLIC_ORIGIN` exactly, and that `PUBLIC_SCHEME` matches (`https` for a public server). After changing the origin, rebuild the web image.
