# Publishing to the feed

Put a session in the public [feed](/feed) so anyone can find it, watch it live or replay it, and take it out again. You need to own the session. A session can be published while it is live or after it has ended.

## Publish a session

1. Open the session page and choose **Share**.
2. Under **Public feed**, choose **Publish**. The sheet explains: "Publishing lists this session on the public feed for anyone to find."
3. The sheet tells you what will change ("Anyone can find this card on the feed", and that access widens to Public if the session was narrower). Choose **Publish to the feed**.

Publishing makes the session public and lists it in the feed. The feed is searchable by title, summary and tag.

## What the feed card shows

Each published session gets a card in the feed with:

- a **live** badge while the session is running;
- the agent and model (for example `Claude Code · claude-opus-5`);
- the title, or a title made from the first prompt if you never named the session;
- a two-line preview taken from the session, worked out once when you publish;
- the author's handle, then the duration, number of events, views and how long ago it was published.

Cards are grouped into **Live now**, **Trending this week** (most watched) and **New**. Tags on the loaded sessions appear under **Tags**; choosing one filters the feed.

The same title and preview are used for the link preview when the session URL is posted elsewhere (X, Slack, iMessage).

## What is hidden from other people

Everything the agent did is visible in a published session: prompts, commands, output, file paths and diffs. To keep machine details out, the server rewrites the text for everyone except you, the owner:

| In the session | What other people see |
| --- | --- |
| `/Users/alice/code/app`, `/home/alice/…`, `/root`, `C:\Users\Alice\…` | `~/code/app`, `~/…` |
| `~bob/notes` | `~/notes` |
| `alice@example.com` | `[email]` |
| `alice-mbp.local`, `nas.lan` | `[host]` |

This applies to the feed card, the link preview, the live stream, the replay and handoff digests. Git remotes such as `git@github.com:org/repo` are kept.

Redaction does not find secrets. Before you publish, read through the replay for API keys, tokens, passwords, internal hostnames that don't end in `.local` or `.lan`, customer data and private repository names. If something is there, don't publish: delete the session, or keep it private.

## Unpublish (remove from the feed)

1. Open the session page and choose **Share**.
2. Under **Public feed**, choose **Remove**.

The session leaves the feed and goes back to private. People you invited by email keep their access. Copies other people already made (screenshots, forks) are not affected. A fork is a separate session owned by whoever made it.

To remove a session completely, delete it from the session page or your session list. Deleting removes the session, its events, its invites and the stored replay, and can't be undone.

## Write it up as a story

The story page (`/story/<id>`) shows a session as a readable write-up you can link to, instead of the live feed view.

## Per agent

Publishing works the same for every agent. Sessions from agents with structured capture (Claude Code, Codex, Antigravity, Gemini CLI 0.26+, ACP agents) produce clearer cards and replays than terminal recordings. See [Agents](/docs/agents).

## If it doesn't work

- **The Publish control is missing.** Only the owner can publish. Check that you are signed in with the account that ran the session.
- **The session is not in the feed search.** Search matches the title, preview and tags. Rename the session to something people would search for.
- **A path still shows my username.** Redaction covers home folders under `/Users`, `/home`, `/root` and `C:\Users`. A path elsewhere (for example `/srv/alice`) is shown as it is.

## Related

- [Sharing & visibility](/docs/sharing)
- [Forks & handoff](/docs/forks-and-handoff)
