# Use cases

What people use LiveShortly for, and how to set each one up. Every setup starts the same way: [install the CLI](/install), sign in, and put `live` in front of your agent.

> **Owner to confirm:** the card asks for a real public session for each use case. None is linked yet; pick published sessions you're happy to feature and add their links below each section. Until then, browse the [feed](/feed).

## Pair with a teammate on an agent run

Two people, one agent. One of you runs it; the other watches and steers from their own browser or terminal.

1. Start the session: `live claude`.
2. Invite your teammate as a commenter: `live share <id> them@example.com`.
3. They open the link, or join from their terminal with `live join <id>`.
4. Their messages reach the agent at its next pause, and they can answer approvals with `/allow` and `/deny` from `live join`.

See [Watching & commenting](/docs/watching-and-commenting).

## Approve risky commands from your phone

Let an agent work through a long task while you're away from the desk, without giving it free rein.

1. Start the agent with permission control on (the default): `live claude`, `live codex`, `live agy` or `live gemini`.
2. Open the session link on your phone.
3. When the agent asks to run something, review the exact command or diff and choose **Allow**, **Always allow for this session** or **Deny**.

Unanswered requests are denied after 8 minutes, so a run never goes ahead unattended. To start the run from your phone as well, leave `live daemon` running on your machine and use **New session**. See [Approvals](/docs/approvals) and [Starting sessions from the web](/docs/web-sessions).

## Teach and learn

Show how you actually work with an agent: the prompts, the dead ends, the fixes.

1. Make the session open (**Share → Open**) so students can watch without an account, or invite them by email.
2. Keep the link role at **Watch** for a lecture, or **Watch and comment** to take questions mid-run.
3. After class, the same link is the replay. Students can continue from any point with `live claude --session <id>`.

See [Sharing & visibility](/docs/sharing) and [Forks & handoff](/docs/forks-and-handoff).

## Demos and streams

Run a live demo where the audience follows on their own screens, and keep it as a replay afterwards.

1. Name it: `live --title "friday demo" claude`.
2. Publish it to the feed (**Share → Publish**), or use **Share to 𝕏** to post the link with a preview card.
3. Read the replay before you publish: redaction hides home paths, emails and `.local` hostnames, not secrets.

See [Publishing to the feed](/docs/publishing).

## Async review of agent work

Review what an agent did in a pull request's worth of context, not just the final diff.

1. Run the work through `live` and share the session with your reviewer.
2. They read the replay: each prompt, command and file change in order, with who approved what.
3. To pick the work up, they fork it: `live handoff <id>` prints a command that continues in the same agent from that point.

See [Forks & handoff](/docs/forks-and-handoff).

## Keep sessions on your own infrastructure

Teams that can't send code output to a hosted service run their own server with Docker Compose and point the CLI at it. Everything above works the same. See [Self-hosting](/docs/self-hosting).
