# Approvals

Approve or deny an agent's tool runs from a tmux popup, the session page, your phone, or another terminal. Permission control is on by default for `live claude`, `live codex`, `live agy` and `live gemini`, and it fails closed: if nobody answers, or approvals can't be reached, the tool does not run. You need to own the session, or have comment access and use `live join`.

## How permission control works

1. The agent asks to run a tool (a shell command, a file edit, a fetch).
2. `live` holds the request and shows it in every place you can answer it.
3. The first answer wins. Everyone watching sees who answered.
4. If nobody answers within 8 minutes, the request is denied.

While permission control is on, `live` is the only gate: the agent's own terminal prompt is skipped and your local allowlist (for example Claude Code's allowed tools) does not apply. Use **Always allow for this session** to cut down on repeated prompts.

When it starts, the terminal says where you can answer:

```text
● live permission control ON — approve tool runs from a CLI popup or the session page
```

Without tmux it says `approve tool runs from the session page` and adds:

```text
● live no tmux — approve tool runs from the session page (install tmux for in-terminal popups)
```

## Fails closed

If the request can't reach the approval service (the local `live` process crashed, timed out, or sent an unreadable reply), the tool is denied, not allowed. The agent is told approvals are offline, and its terminal shows the cause:

```text
live: approvals offline — tool call denied: sidecar unreachable: …
```

Restart the session to restore approvals. Sessions started before v2.3.2 keep the old behaviour until they are restarted.

## Answer from the session page

When a request is waiting, a **Permission requested** bar appears above the message box with the agent's message and a one-line summary of the tool call. Risky calls get a **High risk** label.

1. Choose **Review** to open the review sheet. It shows the exact command, the diff of an edit, or the full content of a file write. Commands have a **Copy** button.
2. Choose one of:
   - **Allow:** runs the tool once.
   - **Always allow for this session:** runs it and stops asking for that command for the rest of the session.
   - **Deny:** refuses it. The agent is told and carries on.
3. The bar confirms your answer, for example `You answered: allowed.`

In the review sheet, ⌘⏎ (Ctrl-Enter) allows and ⌘⌫ (Ctrl-Backspace) denies.

On the session page only the owner can answer. Other viewers see `Waiting for @owner to approve · you can watch`.

## Answer from the tmux popup

With tmux installed, the agent runs in its own tmux session and each request opens a popup over it in your terminal. Answer it with the keyboard. The agent's screen is not touched.

```bash
brew install tmux     # macOS
sudo apt install tmux # Debian/Ubuntu
```

## Answer from your phone

- **On the web:** open the session link on your phone and answer from the bar, as above. The bell in the header lists sessions waiting for approval. If the server has Web Push set up, turning on **Settings → Notifications** also sends a browser notification while the tab is closed. On an iPhone, notifications need the site added to the Home Screen.
- **In the PocketAI app:** see [PocketAI apps](/docs/pocketai).

## Answer from another terminal

Anyone with comment access can answer with `live join <id>`. The prompt turns into a `BLOCKED` chip while a request is waiting:

```text
 ⌐ waiting for permission 09:12:21
   Claude wants to run Write: …/demo/perm2.txt
   ⏸ the agent is waiting — /allow, /deny or /always answers it from here

[BLOCKED — /allow or /deny] ❯ /allow
```

## Per agent

| Agent | Gated by default | What is gated | Turn it off |
| --- | --- | --- | --- |
| Claude Code | Yes | Every tool call | `live --no-permissions claude`, or pass `--dangerously-skip-permissions` or `--permission-mode bypassPermissions` to Claude |
| Codex | Yes | Every tool call (PreToolUse hook) | `live --no-permissions codex`, `--yolo`, `--dangerously-bypass-approvals-and-sandbox`, `-a never`, or `LIVE_CODEX_PERMS=0` |
| Codex app-server (`LIVE_CODEX_APPSERVER=1`) | Yes | Commands and file changes, answered from the web only | `live --no-permissions codex` |
| Antigravity | Yes | Every tool call. If the `liveshortly` plugin can't be installed, `live agy` exits instead of running ungated | `live --no-permissions agy` |
| Gemini CLI 0.26+ | Yes | Everything except read-only tools (read, grep, glob, search…). MCP and unknown tools are gated | `live --no-permissions gemini`, or pass `--yolo`, `-y` or `--approval-mode` to Gemini |
| ACP agents (`LIVE_ACP=1`) | Yes | Every permission request the agent sends, answered from the web | `live --no-permissions …` |
| Gemini CLI before 0.26, Ollama, other terminal agents | No | The agent's own prompt, in its terminal only | — |

Gemini notes: `live` only takes over approvals when its hook is sure to fire. If hooks or extensions are disabled in any Gemini settings scope, an admin extension allowlist is set, a settings file can't be parsed, or the run is under GitHub Actions, Gemini's own prompt stays in charge and the terminal says why (`● live gemini's own prompts approve tools this run: …`). In an untrusted folder Gemini refuses to hand over approvals, so each gated tool is approved twice: on the web, then in Gemini's own prompt.

Headless runs (`claude -p`, `--print`) are never gated.

## Web-started sessions

A session started from **New session** on the site is gated the same way. The **Skip permission prompts** option turns gating off for that session and passes the agent's own "don't ask" flag: `--dangerously-skip-permissions` for Claude, `--yolo` for Gemini, and `--ask-for-approval never` for Codex (Codex keeps its sandbox). See [Starting sessions from the web](/docs/web-sessions).

## If it doesn't work

- **The agent waits and nothing appears on the page.** Reload the page. Check `~/.liveshortly/live.log` for upload errors.
- **`live: approvals offline — tool call denied: …`**: the local `live` process can't answer. Restart the session.
- **A tool was denied after 8 minutes.** Nobody answered in time. Ask the agent to try again.
- **No popup in the terminal.** tmux is not installed. Install it, or answer from the session page.
- **Gemini still asks in its own terminal.** See the Gemini notes above.
- **Your Claude Code allowlist is ignored.** That is expected while permission control is on. Use **Always allow for this session**, or run with `--no-permissions`.

## Related

- [Watching & commenting](/docs/watching-and-commenting)
- [PocketAI apps](/docs/pocketai)
- [Agents](/docs/agents)
