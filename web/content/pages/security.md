# Security

How LiveShortly moves your session data, what protects it, and how to report a problem. This page describes what the software does today, on the hosted service and on a self-hosted server.

## How data flows

```text
your machine                       server                        viewers
─────────────                      ──────                        ───────
agent ──hooks/PTY──▶ live ──HTTPS──▶ API ──▶ Postgres (events)
                      ▲               │  ──▶ disk (replays)
                      │               │  ──▶ Redis (live state)
     approvals,       │               └──HTTPS (SSE)──▶ session page
     viewer messages  └──────────────────────────────── (browser, live join)
```

1. You start an agent with `live`. Nothing is captured otherwise.
2. `live` runs a small helper next to the agent. It sends events to the server over HTTPS, signed with your CLI credentials, and receives viewer messages and approval answers.
3. The server checks every request against the session's visibility and invites, stores the events, and streams them to viewers who are allowed to read them.
4. When the session ends, the events are archived to a replay file.

The server never connects to your machine. Your machine always makes the connection.

## Sign-in and credentials

- The site uses Google sign-in. We don't store passwords.
- `live login` uses a device flow: the CLI shows a code, and you approve it in a signed-in browser. The approval page shows the requesting device, operating system and IP address. Codes last 10 minutes.
- CLI credentials are kept in `~/.liveshortly/credentials.json` with owner-only file permissions. The server stores only a hash of each refresh token. You can revoke any CLI from **Settings**.
- Browser sign-in uses an HTTP-only cookie that lasts up to 7 days.

## Access control

- Sessions are private by default. Visibility (private, anyone with the link, public, open) and invites decide who can read and who can comment. Commenting always needs a signed-in account. See [Sharing & visibility](/docs/sharing).
- Every API call checks access on the server; the web app hides nothing that the API would otherwise return.
- Handoff codes are signed and expire after 7 days, but they are not passes: whoever uses one still needs read access to the source session, checked when they use it.

## Approvals

- Permission control is on by default for Claude Code, Codex, Antigravity and Gemini CLI: each tool run waits until you allow or deny it. See [Approvals](/docs/approvals).
- It **fails closed**. If nobody answers within 8 minutes, or the local approval relay can't be reached, the tool is denied.
- On the web only the session owner can answer. People with comment access can answer from `live join`. Everyone watching sees who answered.
- If a Gemini hook can't be relied on, `live` hands approvals back to Gemini's own prompt rather than pretending to gate it. If Antigravity's plugin can't be installed, `live agy` refuses to start.

## Starting sessions from the web

- `live daemon` only starts agents it found on your machine, in folders you listed with `--dir`. The server sends an agent name and a folder; your machine builds the command. The browser can't run arbitrary commands.
- Sessions run as the daemon's operating-system user. The folder list is not a sandbox. Use a dedicated user or container for anything sensitive.

## Redaction

For everyone except the owner, the server replaces home-folder paths (`/Users/alice` → `~`), email addresses (`[email]`) and `*.local` / `*.lan` hostnames (`[host]`) in everything it sends: the live stream, replays, feed cards, link previews and fork digests.

Redaction does not detect secrets. API keys, tokens and passwords that an agent prints are stored and shown like any other output. Review a session before sharing or publishing it.

## The PocketAI direct daemon

`live daemon --server` is a separate mode for the PocketAI app. It is protected by one shared key, which gives access to every session on that daemon. Use HTTPS (`--tls-cert`/`--tls-key`) or a private network; over plain HTTP the key is sent unencrypted. See [PocketAI apps](/docs/pocketai#keep-it-secure).

## Self-hosting

If your sessions must not leave your infrastructure, run your own server. It is the same open-source code, with your own Google OAuth client, database and secrets. See [Self-hosting](/docs/self-hosting).

## Software updates

The installer and `live update` download releases from GitHub and check each binary's SHA-256 checksum before installing it. A mismatch aborts the install.

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Include what you found, how to reproduce it, and what an attacker could do with it. We'll confirm we received it and keep you updated.

Email: [support@pocket.liveshortly.com](mailto:support@pocket.liveshortly.com)

> **Owner to confirm:** a dedicated security contact (for example a security@ address or GitHub private vulnerability reporting), the response time you commit to, and whether you publish a safe-harbour statement for good-faith research.
