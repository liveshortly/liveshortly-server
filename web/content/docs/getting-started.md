# Getting started

Install the `live` CLI, sign in, stream your first agent session, and open it on your phone. You need macOS or Linux (Windows through WSL 2), a Google account, and a coding agent such as Claude Code, Codex, Gemini CLI or Antigravity installed and signed in on the same machine. It takes about five minutes.

## 1. Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash
```

You should see:

```text
[live-install] downloading live v2.3.3 (darwin/arm64)
[live-install] installed → /usr/local/bin/live
```

The installer downloads a checksum-verified binary for macOS or Linux (arm64 or amd64) from GitHub Releases. To read it first, download it and run it with `bash install.sh`.

With Homebrew instead:

```bash
brew tap liveshortly/tap
brew install liveshortly/tap/live
```

Check it worked:

```bash
live version
```

## 2. Sign in

```bash
live login
```

The CLI prints a link and a code, and opens the link in your browser:

```text
Open to approve this device:

    https://liveshortly.com/device?code=ABCD-1234

(code: ABCD-1234)
```

Sign in with Google if the browser asks. The approval page shows the code, your account, the device name, its operating system, its IP address and when the request was made. Check that the code matches your terminal, then choose **Approve**. The code expires after 10 minutes.

The terminal then confirms:

```text
✓ you@example.com (https://liveshortly.com)
```

Your credentials are saved in `~/.liveshortly/credentials.json` and refresh on their own. `live whoami` shows who you are signed in as and which server the CLI uses.

### Using your own server

With no configuration the CLI uses the hosted service at liveshortly.com. To use a server you run yourself (see [Self-hosting](/docs/self-hosting)), write its address to `~/.liveshortly/host.json` before `live login`:

```bash
mkdir -p "$HOME/.liveshortly"
cat > "$HOME/.liveshortly/host.json" <<'JSON'
{"api_url":"https://live.example.com","web_url":"https://live.example.com"}
JSON
```

The CLI picks the server in this order: `host.json`, then the `LIVESHORTLY_API_URL` environment variable, then `https://liveshortly.com`. Credentials belong to one server: after switching, run `live logout` and `live login` again. Accounts and sessions are not shared between the hosted service and a self-hosted one.

## 3. Start a session

Put `live` in front of the agent you normally run:

```bash
live claude
```

You should see the link to the session page before the agent starts:

```text
● live streaming → https://liveshortly.com/session/3f2a9c1e-…
```

Then the agent opens as usual. Use it the way you always do. Nothing else changes in your terminal, and the agent's exit code is passed through unchanged.

The same works for the other agents:

```bash
live codex
live gemini
live agy
live ollama run llama3
live -- ./scripts/deploy.sh   # any command; -- ends live's own options
```

`live --title "friday demo" claude` names the session. Without `--title` it is named after the current directory.

## 4. Open the link on your phone

Open the `live streaming →` link on any device where you are signed in to the same account. The session page shows the prompts, tool calls, file diffs and replies as they happen. On a phone the layout is a single column, with the message box at the bottom.

When the agent asks to run a tool, a **Permission requested** bar appears on the page. You can approve it from the phone. See [Approvals](/docs/approvals).

New sessions are private: only you can open the link. To let other people watch, see [Sharing & visibility](/docs/sharing).

## 5. End the session

Quit the agent as usual. The CLI uploads what is left and prints the replay link:

```text
● live session archived → https://liveshortly.com/session/3f2a9c1e-…
```

The same link now shows a replay of the whole session.

## Per agent

- **Claude Code:** full capture through Claude Code's hooks. The first run asks whether to load development channels; answer yes so viewer messages reach Claude while it is idle.
- **Codex:** runs inside tmux so viewer messages can be typed into it. Install tmux first (`brew install tmux` or `sudo apt install tmux`).
- **Gemini CLI:** version 0.26 or later gets full capture through a `liveshortly` extension that `live` installs. Older versions are recorded as terminal output.
- **Antigravity (`agy`):** full capture through a `liveshortly` plugin that `live` installs. If the plugin can't be installed, `live agy` exits instead of running ungated.
- **Ollama and other terminal agents:** recorded as terminal output, one row per line.
- **Any agent that speaks the Agent Client Protocol:** run its ACP entry point with `LIVE_ACP=1`, for example `LIVE_ACP=1 live goose acp`. See [Agents](/docs/agents).

## If it doesn't work

- `live: command not found`: open a new terminal so your shell picks up the new `PATH`, or add the folder the installer printed to `PATH`.
- ``not signed in — run `live login` ``: you are not signed in to this server. Run `live login`.
- ``already signed in as you@example.com — `live logout` first to switch accounts``: run `live logout`, then `live login`.
- `live: command not found: claude`: the agent itself is not on your `PATH`. Install it, or check the name.
- The session page stays empty: check `~/.liveshortly/live.log`. Every failed upload is logged there with the reason.

More in [Troubleshooting](/docs/troubleshooting).

## Update or remove the CLI

```bash
live update                       # latest release
live update --version v2.1.2      # a specific version
brew upgrade liveshortly/tap/live # if you installed with Homebrew
live uninstall                    # remove the binary and sign out
```

`live uninstall --purge` also removes everything in `~/.liveshortly`.

## Next

- [Watching & commenting](/docs/watching-and-commenting): what viewers see and how their messages reach the agent.
- [Approvals](/docs/approvals): answering tool requests from the browser, the terminal or your phone.
- [Sharing & visibility](/docs/sharing): letting other people in.
