# Pricing

LiveShortly is free. There are no paid plans.

## Hosted: free

Sign in at liveshortly.com with Google and stream sessions. Each account gets:

| Limit | Amount |
| --- | --- |
| Stored session data | 100 MB |
| Live sessions at once | 10 |
| Size of one event (a single reply, tool output or diff) | 256 KB; larger output is cut |
| Sessions, viewers, invites, published sessions | No set limit |

When you reach the storage limit, the running session ends and the CLI gives you a command to continue in a new session once you've deleted old ones to free space. Your profile page shows how much you're using.

> **Owner to confirm:** these figures are the server's defaults (`DEFAULT_STORAGE_LIMIT_BYTES`, `DEFAULT_MAX_LIVE_SESSIONS`). Confirm the hosted service runs with them, and whether you want to state any limit on viewers or published sessions.

## Self-host: free

Run the open-source server on your own infrastructure with Docker Compose. No licence fee, and your sessions never touch liveshortly.com. The same default limits apply, and your admins can change them for each user. See [Self-hosting](/docs/self-hosting).

## The CLI and PocketAI daemon: free

The `live` CLI, `live daemon`, and the direct daemon for the PocketAI app are free and open source.

## Your agents

LiveShortly doesn't charge for or include model usage. Claude Code, Codex, Gemini CLI and the other agents run on your machine with your own accounts and are billed by their providers as usual.

## Plans

There are no paid plans today. If that changes, existing sessions stay yours, and we'll announce it in the [changelog](/changelog) first.

> **Owner to confirm:** whether to promise anything about future plans (the sentence above), or remove it.
