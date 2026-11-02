# Approvals

Approve or deny an agent's tool runs from a tmux popup, the session page, or your phone. Permission control is on by default for `live claude` and `live agy`.

## How permission control works

When the agent wants to run a tool, the request is held until someone answers it. You can answer from:

- a tmux popup in your terminal (when tmux is installed),
- the session page in any browser,
- `live join` with `/allow`, `/deny` or `/always`,
- the PocketAI app (see [PocketAI apps](/docs/pocketai)).

The first answer wins. Unanswered requests are denied after about 8 minutes.

## Approve, deny, or allow always

- **Allow** runs the tool once.
- **Deny** refuses it.
- **Allow always** remembers that command for the rest of the session so it stops asking.

On the session page only the owner can answer. People joined with comment access can answer from `live join`, and everyone watching sees who answered.

While permission control is on, every tool is gated and your local Claude Code allowlist does not apply. Use **Allow always** to cut down on repeated prompts.

## Turn it off

```bash
live --no-permissions claude   # off for this run
LIVE_TMUX=0 live claude        # keep it on, answer only from the web
```

Headless runs (`claude -p` / `--print`) are never gated.

## Install tmux for the terminal popup

```bash
brew install tmux     # macOS
sudo apt install tmux # Debian/Ubuntu
```

Without tmux you approve from the session page instead.
