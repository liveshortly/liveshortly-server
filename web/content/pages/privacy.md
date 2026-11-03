# Privacy

What the hosted LiveShortly service at liveshortly.com stores about you, why, for how long, and how to delete it. This page describes what the software does today. A self-hosted server stores the same things, on infrastructure its operator controls; this page does not cover it.

> **Owner to confirm:** the legal entity that operates liveshortly.com (the data controller), its address, the governing law, and whether this page needs GDPR / CCPA / India DPDP-specific sections (legal basis, rights requests, data transfers). Nothing below names a company.

## The short version

- Nothing is captured unless you start a command with `live`.
- A session contains what the agent showed on screen: prompts, replies, commands and their output, and diffs of the files it changed. It does not upload your repository.
- Sessions are private until you share them.
- We sign you in with Google and keep your Google account id, email and name. We don't keep your profile picture.
- We don't run advertising or third-party analytics on the site, and we don't sell data.
- You can delete any session at any time, and it is gone for good.

## What we store

### Your account

When you sign in with Google we receive and store:

- your Google account id (`sub`), email address and name;
- the handle you use on the site;
- when you joined and when you last signed in.

Google also sends your profile picture URL. We ignore it and don't store it.

For limits we store how much session data you have stored, and any limits set for your account.

### Sessions

For each session you stream:

- **Details:** title, tags, the agent and model, how it was captured, the git remote and branch of the folder it ran in, the machine's `user@hostname` as reported by the CLI, token-usage counts, view and event counts, visibility, and start and end times.
- **Events:** the session itself: prompts, replies, tool calls and their output, file paths and diffs, terminal output, viewer messages, and approval answers with who gave them. Each event is capped at 256 KB.
- **Replay:** when a session ends, an archive of its events is stored on the server's disk.
- **Sharing:** the email addresses you invited and their roles.
- **Read marks:** for each session you've opened, how far you've read, so unread counts follow you between browsers.

What ends up in a session depends on what the agent does. If the agent prints a secret, a customer record or a private file, that becomes part of the session. Check before you share or publish.

### Signing in the CLI

- When you run `live login`, we keep a short record of the request (device name, operating system, browser user agent, IP address and country) for 10 minutes so the approval page can show you who is asking. It is then discarded.
- Each signed-in CLI gets a refresh token. We store only a hash of it, with a label naming the device, and when it was last used.

### Connected machines

While `live daemon` runs, the server keeps the machine's hostname, the agents it offers and the folders you allowed. This is held in memory (Redis) and expires about 90 seconds after the daemon stops.

### Notifications

If you turn on browser notifications, we store the push address your browser gives us. Notifications carry no content; your browser fetches it from us when one arrives.

### Cookies and local storage

- `ls_session`: keeps you signed in, for up to 7 days.
- A short-lived cookie during Google sign-in that protects the sign-in from forgery, deleted after 10 minutes.
- Your browser's local storage keeps display preferences (theme, recent searches, view options). It never leaves your browser.

No advertising or tracking cookies are set.

### Server logs

Our web server records requests (including IP addresses) in its logs for operating and securing the service.

> **Owner to confirm:** how long web server and application logs are kept on the hosted service.

## Who can see your data

- **You** see everything in your sessions.
- **People you share with** see the sessions you share, at the level you choose. See [Sharing & visibility](/docs/sharing).
- **Everyone** can see sessions you publish to the feed or make open.
- For anyone other than you, home-folder paths, email addresses and `*.local` hostnames in your sessions are replaced (`~`, `[email]`, `[host]`). Other text is shown as it is.
- **Service admins** can see account and session lists to run the service and enforce limits.

> **Owner to confirm:** the internal access policy for admins (who has admin access, and when they may open a private session).

## How long we keep it

- Sessions are kept until you delete them.
- Your account is kept until it is deleted.
- Sign-in requests: 10 minutes. Connected machines: about 90 seconds after they stop.

> **Owner to confirm:** whether inactive accounts or sessions are ever removed automatically, and backup retention for the database.

## Deleting your data

- **A session:** delete it from the session page or your session list. This removes its details, events, invites, replay file and live state immediately. It can't be undone. Forks other people made are their own sessions and are not deleted; they show only a reference to the deleted source.
- **Signing out a CLI:** `live logout` on that machine, or revoke it from **Settings**.
- **Your account:** there is no self-service account deletion yet. Email [support@pocket.liveshortly.com](mailto:support@pocket.liveshortly.com) from the address you sign in with.

> **Owner to confirm:** the account-deletion process and response time, and whether support@pocket.liveshortly.com is the right contact for LiveShortly privacy requests.

## Service providers

The hosted service runs on:

| Provider | What for |
| --- | --- |
| Google | Sign-in (Google OAuth) |
| Amazon Web Services | Application servers (US West) |
| Supabase | Database hosting (US West) |
| GitHub | CLI downloads and source code |
| Your browser's push service (Apple, Google, Mozilla) | Notifications, only if you turn them on |

> **Owner to confirm:** this list is read from the deploy configuration. Confirm it is complete (DNS, CDN, email, backups) and add any data-processing terms.

## Children

> **Owner to confirm:** the minimum age for using the hosted service.

## Changes

We'll update this page when what the service stores changes. The [changelog](/changelog) lists every release.

## Contact

[support@pocket.liveshortly.com](mailto:support@pocket.liveshortly.com)
