# Glossary

Terms used in these docs and in the app.

## Terms

**Session**: one run of an agent started with `live`. It is live while the agent runs and ended afterwards, when it becomes a replay.

**Event**: one item in a session: a prompt, a reply, a tool call, a file change, terminal output or a viewer message. Events are numbered in order (`seq`).

**Replay**: an ended session, played back from its events.

**Handle**: the 8-character short form of a session id that `live ls` prints.

**Hook capture**: how Claude Code and Antigravity are recorded, through the agent's own lifecycle hooks. Gives structured events.

**Terminal capture (PTY)**: how other commands are recorded, by reading what they print to the terminal.

**Comment / viewer message**: a message someone watching sends to the session. It is shown to everyone watching and delivered once to the agent.

**Permission control**: holding each tool run until someone allows or denies it. See [Approvals](/docs/approvals).

**Visibility**: who can open a session: private, anyone with the link, public, or open. See [Sharing & visibility](/docs/sharing).

**Viewer / commenter**: roles for invited people. Viewers watch; commenters can also send messages.

**Feed**: the public list of published sessions.

**Fork**: a new session, owned by you, that continues an existing one. The original is unchanged.

**Handoff code**: a 7-day code (`ho_...`) that lets someone fork a session from a fixed point.

**Prior context**: the source session's history shown above a fork's own events.

**Daemon**: `live daemon`, a process that lets you start sessions on your machine from the web, or, with `--server`, from the PocketAI app.

**Host**: a machine running `live daemon` that is connected to your account.

**Self-hosting**: running your own LiveShortly server. See [Self-hosting](/docs/self-hosting).
