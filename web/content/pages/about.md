# About LiveShortly

LiveShortly lets you watch a coding agent work, live. Type `live claude` instead of `claude`, and a link appears where you, your team or anyone you choose can follow every prompt, tool call and file diff as it happens, send the agent a message, and approve what it runs. When the session ends, the same link becomes a replay.

## What it is

- **The `live` CLI:** one small Go binary for macOS and Linux that wraps the agent you already use: Claude Code, Codex, Gemini CLI, Antigravity, Ollama, any agent that speaks the Agent Client Protocol, or any other command. Nothing is captured unless you type `live`.
- **The server and web app:** where sessions are stored, shared, published and replayed. Use the hosted service at liveshortly.com, or run your own.
- **The feed:** sessions people chose to publish, to learn from and to show their work.

Both the CLI and the server are open source: [github.com/liveshortly](https://github.com/liveshortly).

## Why it exists

Coding agents now do long stretches of work on their own. Most of that work happens in one person's terminal, where nobody else can see it, step in, or approve the risky parts. LiveShortly puts that terminal on a link: a teammate can review a run while it happens, you can approve a command from your phone, and a good session can be shared as it was, not retold.

It started as a weekend "wouldn't it be cool if…" project.

## PocketAI

PocketAI is LiveShortly's app for iPhone and Mac. It runs agents on your own machine through `live daemon` and lets you approve their tool runs from your phone. It lives at [pocket.liveshortly.com](https://pocket.liveshortly.com). See [PocketAI apps](/docs/pocketai).

## Who makes it

LiveShortly is made by [@ironfisto](https://x.com/ironfisto/) and [@sec_r0](https://x.com/sec_r0).

> **Owner to confirm:** how you want the makers presented (names, roles, company), and any company or legal details to show here.

## Get in touch

- Questions and help: [support@pocket.liveshortly.com](mailto:support@pocket.liveshortly.com)
- Bugs and feature requests: [GitHub issues](https://github.com/liveshortly/live/issues)
- Security reports: see [Security](/security)

## More

- [Install](/install)
- [Docs](/docs)
- [Use cases](/use-cases)
- [Pricing](/pricing)
- [Changelog](/changelog)
