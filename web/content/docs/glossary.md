# Glossary

Terms used in these docs, in the CLI and on the site, in alphabetical order.

## Terms

**ACP (Agent Client Protocol)**: an open protocol for talking to coding agents. `LIVE_ACP=1` runs any agent that speaks it with structured capture and web approvals. See [Agents](/docs/agents#any-acp-agent).

**Admin**: a user who can see the admin pages and change users' limits. On a self-hosted server it is a database flag. See [Self-hosting](/docs/self-hosting).

**agents.json**: `~/.liveshortly/agents.json`, the file where you list extra agents for `live daemon`, with `type_comments` and `acp` options. See [Starting sessions from the web](/docs/web-sessions#which-agents-are-offered).

**Allow / Deny / Always allow for this session**: the three answers to a permission request. Always allow stops asking for that command for the rest of the session.

**Approval / permission request**: an agent asking to run a tool, held until someone answers. See [Approvals](/docs/approvals).

**Approvals offline**: what you see when a gated tool is denied because the local `live` process could not answer. Approvals fail closed.

**Capture**: how `live` records a session: hooks, a rollout file, ACP, or terminal recording.

**Comment / viewer message**: a message someone watching sends to the session. It is shown to everyone watching and delivered once to the agent.

**Commenter**: an invited person who can watch, send messages and answer approvals from `live join`. Shown as **Comment** in the share sheet.

**Daemon**: `live daemon`, a process that lets you start sessions on your machine from the web, or, with `--server`, from the PocketAI app.

**Device flow**: how `live login` signs in: the CLI shows a code, you approve it on the `/device` page in your browser.

**Digest**: the summary of a source session that a fork starts with. Built from the event log, without an AI model.

**Event**: one item in a session: a prompt, a reply, a tool call, a file change, terminal output, a viewer message or an approval. Events are numbered in order (`seq`).

**Fails closed**: when approvals can't be reached or nobody answers, the tool is denied, not allowed.

**Feed**: the public list of published sessions at [/feed](/feed).

**Fork**: a new session, owned by you, that continues an existing one. The original is unchanged.

**Handle**: the 8-character short form of a session id that `live ls` prints. Also your `@name` on the site.

**Handoff code**: a 7-day code (`ho_...`) that lets someone fork a session from a fixed point.

**Harness**: an agent CLI that `live` knows how to capture, such as Claude Code or Codex. The [support matrix](/docs/agents#what-works-where) lists them.

**Hook capture**: how Claude Code, Antigravity and Gemini CLI are recorded, through the agent's own lifecycle hooks. Gives structured events.

**Host**: a machine running `live daemon` that is connected to your account. `live hosts` lists them.

**host.json**: `~/.liveshortly/host.json`, which tells the CLI which server to use.

**Link role**: what people who open a session by its link can do: **Watch**, or **Watch and comment**.

**Live**: a session whose agent is still running. Shown with a live badge.

**New session**: the page on the site that starts an agent on one of your hosts.

**Open**: the visibility level that lets anyone watch without signing in.

**Prior context**: the source session's history shown above a fork's own events.

**Private**: the default visibility: only you and people you invite.

**Public**: the visibility level for any signed-in person with the link; the session can appear on the feed.

**Publish**: list a session in the public feed. See [Publishing](/docs/publishing).

**Redaction**: replacing home paths, emails and `*.local` hostnames for everyone except the owner.

**Replay**: an ended session, played back from its events at the same link.

**Rollout file**: the file Codex writes its own session to. `live` reads it to capture Codex.

**Self-hosting**: running your own LiveShortly server. See [Self-hosting](/docs/self-hosting).

**Session**: one run of an agent started with `live`. It is live while the agent runs and ended afterwards, when it becomes a replay.

**Share sheet**: the **Share** panel on a session page, where you set visibility, the link role, invites and publishing.

**Sidecar**: the part of `live` that runs next to the agent, sends events to the server and relays approvals and messages.

**Skip permission prompts**: the New session option that runs a web-started agent without approvals.

**Story**: the readable write-up of a session at `/story/<id>`.

**Terminal capture (PTY)**: how other commands are recorded, by reading what they print to the terminal.

**tmux popup**: the approval prompt shown over the agent in your terminal when tmux is installed.

**Typing indicator**: the "… is typing" line under the message box. Not saved.

**Viewer**: an invited person who can watch only. Shown as **Watch** in the share sheet.

**Visibility**: who can open a session: private, anyone with the link, public, or open. See [Sharing & visibility](/docs/sharing).
