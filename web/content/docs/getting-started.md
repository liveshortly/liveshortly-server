# Getting started

Install the `live` CLI, connect it to your LiveShortly server, sign in, and stream your first session. You need macOS or Linux, a LiveShortly server (see [Self-hosting](/docs/self-hosting)), and a coding agent such as Claude Code.

## Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash
```

This installs a checksum-verified binary for macOS or Linux (arm64 or amd64) from GitHub Releases. To read the installer first, download it and run it with `bash install.sh`.

With Homebrew:

```bash
brew tap liveshortly/tap
brew install liveshortly/tap/live
```

## Point the CLI at your server

The CLI reads the server address from `~/.liveshortly/host.json`. Use the same address people open in their browser:

```bash
mkdir -p "$HOME/.liveshortly"
cat > "$HOME/.liveshortly/host.json" <<'JSON'
{"api_url":"https://live.example.com","web_url":"https://live.example.com"}
JSON
```

Replace both URLs with your server. A fresh CLI with no `host.json` uses `http://localhost:8080`, which matches the local Compose stack.

## Sign in

```bash
live login
live whoami
```

`live login` opens your browser to approve the sign-in. Your credentials are saved in `~/.liveshortly/credentials.json` and refresh on their own. They belong to one server: run `live login` again if you change servers.

## Start your first session

Put `live` in front of the agent you normally run:

```bash
live claude
```

The CLI prints a link to the session page:

```text
● live streaming → https://live.example.com/session/<id>
```

Open it to watch the session as it happens. When the agent exits, the session ends and the same link becomes a replay. The agent's exit code is passed through unchanged.

New sessions are private. See [Sharing & visibility](/docs/sharing) to let other people watch.

## Update or remove the CLI

```bash
live update                       # latest release
live update --version v2.1.2      # a specific version
brew upgrade liveshortly/tap/live # if you installed with Homebrew
live uninstall                    # remove the binary and sign out
```

`live uninstall --purge` also removes everything in `~/.liveshortly`.
