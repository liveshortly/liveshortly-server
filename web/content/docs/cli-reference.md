# CLI reference

Every `live` command and flag. This page is generated from `live --help`; run `live --help` to see the same text for the version you have installed.

## Usage

### `live login`

Sign in (browser device flow)

### `live logout`

Delete stored credentials

### `live whoami`

Show the signed-in account

### `live version`

Print version

### `live update`

Self-update to the latest release

### `live update --version vX.Y.Z`

Install a specific published version

### `live uninstall`

Remove the binary + sign out (add --purge for all state)

### `live claude [args...]`

Run Claude Code, captured via lifecycle hooks

### `live agy [args...]`

Run Antigravity CLI, captured via lifecycle hooks

### `live <command> [args...]`

Run any agent/CLI, captured via PTY recording

### `live daemon [--dir <p>]`

Let this machine start sessions from the web

### `live -- <command> [...]`

Same, unambiguous form

### `live handoff <session-id>`

Print the copyable command to continue a session

### `live context [<id>]`

Reprint a fork's prior-context digest

## Browse and join sessions from the terminal

### `live ls [filters]`

List your sessions (add --live for running ones)

### `live shared`

List the sessions other people shared with you

### `live info <id>`

Everything about one session + its last events

### `live join <id>`

Attach to a LIVE session: watch it and talk to the agent from your terminal — the other person's CLI sees your message, you see their agent's work. Turns are shown with their author and in full; ↑/↓ recall, /help lists the slash commands. --full for all history, -n &lt;count> for some of it

### `live watch <id>`

Same, read-only

### `live share <id> <email>`

Grant someone access (--role viewer|commenter)

### `live stop <id>`

End a running session

### `live open <id>`

Open the session page in a browser

### `live hosts`

List your machines running "live daemon"

&lt;id> is the 8-character handle printed by "live ls", or a full session id. ls shows the 10 most recent by default: --all for every one, -n &lt;limit> for a count. Other filters: --mine --shared --live --ended -q &lt;text> --json

While joined, /allow, /deny and /always answer a permission prompt the agent is stuck on — so a session does not stall because its owner walked away.

## Continue (fork) an existing session as a NEW session you own

### `live claude --session <id>`

Continue from a session's latest state

### `live agy --session <id>`

Continue from a session's latest state

### `live claude --handoff <code>`

Continue from a pinned handoff snapshot

### `live agy --handoff <code>`

Continue from a pinned handoff snapshot

The original session is untouched; the fork is a new session owned by you, and your agent orients itself from the prior context on launch. Works with any agent (live gemini --session &lt;id>, …). --session/--handoff need read access to the source (a private, unshared session returns "no access"). The history is printed in the agent's own terminal — scroll up to re-read it, press Ctrl-B h for a popup, or run "live context" from another shell.

## Start sessions from the browser (no terminal needed)

### `live daemon`

Register this machine and wait for requests

### `live daemon --dir ~/code/api`

Offer one specific directory (repeatable)

Leave it running, then hit "+ New session" on the site and pick the machine, the agent and the directory. A web-started session is a normal session: same hooks, same permission gating. Take one over locally any time with "tmux -L liveshortly attach -t live-&lt;first 8 chars of the session id>". Only the directories you pass to --dir (default: the current one) can ever be used, and only claude / agy / codex / gemini can ever be started.

## Permission control (always ON for live claude and live agy)

You approve tool runs from a tmux popup (if tmux is installed) or the session page — allow / deny / allow-always, owner only. While on, it gates every tool, so your local allowlist is bypassed. Without tmux you approve from the session page. Use --no-permissions to turn it off for a run.

## Options (before the command)

| Name | What it does |
| --- | --- |
| `--title <t>` | Session title (default: current directory name) |
| `--no-permissions` | Turn permission control off for this run |
| `--session <id>` | Continue from an existing session (fork) |
| `--handoff <code>` | Continue from a handoff snapshot (fork) |
| `--pre-digest` | Pre-compress the handoff context with claude -p |

## Environment

| Name | What it does |
| --- | --- |
| `LIVESHORTLY_API_URL` | Self-hosted server (default https://liveshortly.com; ~/.liveshortly/host.json wins over this) |
| `LIVESHORTLY_CRED_PATH` | Credential file (default ~/.liveshortly/credentials.json) |
| `LIVE_CHANNEL=0` | Disable the viewer channel (instant idle comment delivery); comments then arrive at hook boundaries |

## Full `live --help` output

```text
live — stream your coding-agent session to LiveShortly

Usage:
  live login                 Sign in (browser device flow)
  live logout                Delete stored credentials
  live whoami                Show the signed-in account
  live version               Print version
  live update                Self-update to the latest release
  live update --version vX.Y.Z   Install a specific published version
  live uninstall             Remove the binary + sign out (add --purge for all state)

  live claude [args...]      Run Claude Code, captured via lifecycle hooks
  live agy [args...]         Run Antigravity CLI, captured via lifecycle hooks
  live <command> [args...]   Run any agent/CLI, captured via PTY recording
  live daemon [--dir <p>]    Let this machine start sessions from the web
  live -- <command> [...]    Same, unambiguous form
  live handoff <session-id>  Print the copyable command to continue a session
  live context [<id>]        Reprint a fork's prior-context digest

Browse and join sessions from the terminal:
  live ls [filters]          List your sessions (add --live for running ones)
  live shared                List the sessions other people shared with you
  live info <id>             Everything about one session + its last events
  live join <id>             Attach to a LIVE session: watch it and talk to the
                             agent from your terminal — the other person's CLI
                             sees your message, you see their agent's work.
                             Turns are shown with their author and in full;
                             ↑/↓ recall, /help lists the slash commands.
                             --full for all history, -n <count> for some of it
  live watch <id>            Same, read-only
  live share <id> <email>    Grant someone access (--role viewer|commenter)
  live stop <id>             End a running session
  live open <id>             Open the session page in a browser
  live hosts                 List your machines running "live daemon"

  <id> is the 8-character handle printed by "live ls", or a full session id.
  ls shows the 10 most recent by default: --all for every one, -n <limit> for a
  count. Other filters: --mine --shared --live --ended -q <text> --json

  While joined, /allow, /deny and /always answer a permission prompt the agent
  is stuck on — so a session does not stall because its owner walked away.

Continue (fork) an existing session as a NEW session you own:
  live claude --session <id>       Continue from a session's latest state
  live agy --session <id>          Continue from a session's latest state
  live claude --handoff <code>     Continue from a pinned handoff snapshot
  live agy --handoff <code>        Continue from a pinned handoff snapshot
  The original session is untouched; the fork is a new session owned by you,
  and your agent orients itself from the prior context on launch. Works with
  any agent (live gemini --session <id>, …). --session/--handoff need read
  access to the source (a private, unshared session returns "no access").
  The history is printed in the agent's own terminal — scroll up to re-read it,
  press Ctrl-B h for a popup, or run "live context" from another shell.

Start sessions from the browser (no terminal needed):
  live daemon                      Register this machine and wait for requests
  live daemon --dir ~/code/api     Offer one specific directory (repeatable)
  Leave it running, then hit "+ New session" on the site and pick the machine,
  the agent and the directory. A web-started session is a normal session: same
  hooks, same permission gating. Take one over locally any time with
  "tmux -L liveshortly attach -t live-<first 8 chars of the session id>".
  Only the directories you pass to --dir (default: the current one) can ever be
  used, and only claude / agy / codex / gemini can ever be started.

Permission control (always ON for live claude and live agy):
  You approve tool runs from a tmux popup (if tmux is installed) or the
  session page — allow / deny / allow-always, owner only. While on, it
  gates every tool, so your local allowlist is bypassed. Without tmux you
  approve from the session page. Use --no-permissions to turn it off for a run.

Options (before the command):
  --title <t>                Session title (default: current directory name)
  --no-permissions           Turn permission control off for this run
  --session <id>             Continue from an existing session (fork)
  --handoff <code>           Continue from a handoff snapshot (fork)
  --pre-digest               Pre-compress the handoff context with claude -p

Environment:
  LIVESHORTLY_API_URL        Self-hosted server (default https://liveshortly.com;
                             ~/.liveshortly/host.json wins over this)
  LIVESHORTLY_CRED_PATH      Credential file (default ~/.liveshortly/credentials.json)
  LIVE_CHANNEL=0             Disable the viewer channel (instant idle comment
                             delivery); comments then arrive at hook boundaries
```
