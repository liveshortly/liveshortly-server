# FAQ

Short answers to common questions.

## Does LiveShortly slow down my agent?

No. Capture runs alongside the agent and gives up within a few seconds if the server is slow or unreachable. If the server is down, your agent keeps running normally; only the stream is lost.

## Is anything captured when I don't type `live`?

No. Only commands you start with `live` are captured. `claude` on its own is not.

## Who can see my sessions?

Only you, until you share them. New sessions are private. See [Sharing & visibility](/docs/sharing).

## Can viewers control my agent?

People with comment access can send messages, which the agent sees as context at its next pause. They cannot type into your terminal. On the session page only you can answer permission prompts; people joined with comment access can answer them from `live join`.

## Do I need a LiveShortly account?

You sign in to a LiveShortly server, which you or your team runs. See [Self-hosting](/docs/self-hosting). Watching an open session needs no account.

## Can I use it without Google sign-in?

The web platform uses Google sign-in. For PocketAI only, `live daemon --server` uses a shared key instead and needs no web platform. See [PocketAI apps](/docs/pocketai).

## Which agents are supported?

Claude Code and Antigravity get full structured capture. Codex, Gemini CLI, Ollama and any other command are captured as terminal output. See [Agents](/docs/agents).

## Is it open source?

Yes. The server is at [github.com/liveshortly/liveshortly-server](https://github.com/liveshortly/liveshortly-server) and the CLI at [github.com/liveshortly/live](https://github.com/liveshortly/live).
