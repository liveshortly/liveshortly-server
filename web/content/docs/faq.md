# FAQ

Short answers to common questions. Each links to the page with the details.

## What is LiveShortly?

A way to stream a coding agent's session to a web page while it runs. You type `live claude` instead of `claude`, and you get a link where people can watch the prompts, tool calls and file diffs, send the agent messages, and approve its tool runs. When the session ends, the link becomes a replay. See [Getting started](/docs/getting-started).

## Does it cost anything?

The hosted service at liveshortly.com is free, with per-account limits. Self-hosting is free; the server is open source. See [Pricing](/pricing).

## Do I need an account?

To stream sessions, yes: you sign in with Google, on liveshortly.com or your own server. Watching an open session needs no account. Sending messages always needs one.

## Can I use it without Google sign-in?

The web platform uses Google sign-in only. For the PocketAI app, `live daemon --server` uses a shared key instead and needs no web platform. See [PocketAI apps](/docs/pocketai).

## Does LiveShortly slow down my agent?

No. Capture runs alongside the agent and gives up within a few seconds if the server is slow or unreachable. If the server is down, your agent keeps running normally; only the stream is lost. The one thing that can make an agent wait is permission control, which waits for your answer by design.

## Is anything captured when I don't type `live`?

No. Only commands you start with `live` are captured. `claude` on its own is not. There is no background process unless you start `live daemon`.

## Who can see my sessions?

Only you, until you share them. New sessions are private. See [Sharing & visibility](/docs/sharing).

## Can viewers control my agent?

People with comment access can send messages, which the agent sees at its next pause. They can't type into your terminal. On the session page only you can answer permission requests; people with comment access can answer them from `live join`.

## What happens if nobody answers a permission request?

It is denied after 8 minutes, and the agent carries on. If approvals can't be reached at all, the tool is denied straight away. See [Approvals](/docs/approvals).

## Which agents are supported?

Claude Code, Codex, Antigravity and Gemini CLI 0.26+ get structured capture and approvals. Any agent that speaks the Agent Client Protocol gets the same with `LIVE_ACP=1`. Ollama and any other command are recorded as terminal output. See [Agents](/docs/agents).

## Does it work on Windows?

Through WSL 2. There is no native Windows build. Install `live` inside your WSL terminal.

## Can I watch from my phone?

Yes. Open the session link in your phone's browser. You can send messages and approve tool runs from there. See [Approvals](/docs/approvals#answer-from-your-phone).

## Is my code uploaded?

Only what the agent shows in the session: prompts, replies, commands and their output, and the diffs of files it changed. `live` does not upload your repository. Whatever the agent reads and prints is part of the session, so treat a session like a screen recording.

## Are secrets hidden?

Not automatically. For anyone other than you, home-folder paths, email addresses and `*.local` hostnames are hidden. API keys and passwords that appear in output are not. Check a session before you share or publish it. See [Publishing](/docs/publishing#what-is-hidden-from-other-people).

## How do I delete a session?

From the session page or your session list. Deleting removes the session, its events, its invites and its replay for good.

## How long are sessions kept?

Until you delete them. Storage counts against your account's limit. See [Privacy](/privacy).

## Can I continue someone else's session?

If you can read it, yes: `live claude --session <id>` starts a new session you own with the earlier history as context. The original is unchanged. See [Forks & handoff](/docs/forks-and-handoff).

## Can I start sessions without a terminal?

Yes. Run `live daemon --dir <project>` on your machine and use **New session** on the site. See [Starting sessions from the web](/docs/web-sessions).

## Can I run my own server?

Yes, with Docker Compose. Accounts and sessions are not shared between the hosted service and your server. See [Self-hosting](/docs/self-hosting).

## Is it open source?

Yes. The server is at [github.com/liveshortly/liveshortly-server](https://github.com/liveshortly/liveshortly-server) and the CLI at [github.com/liveshortly/live](https://github.com/liveshortly/live).

## How do I report a security problem?

See [Security](/security).
