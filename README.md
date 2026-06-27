# LiveShortly

Share a live coding/agent **session** — watch it stream in the browser, browse and
replay every past session. A lean monorepo: Go API + Next.js terminal-HUD web +
Claude Code capture hooks.

```
LiveShortly/
├── api/    Go backend (chi · pgx · go-redis) — sessions, events, SSE, search, stats
├── web/    Next.js terminal HUD — LIVE tab, SESSIONS tab + search, session viewer
├── cli/    Claude Code hooks — stream your real Claude sessions into LiveShortly
├── docker-compose.yml
└── CONTRACT.md   ← the binding API + design spec
```

## Run

```bash
cp .env.example .env          # ports/handles already set in .env
docker compose up -d --build
```

- Web:  http://localhost:3000  (WEB_PORT)
- API:  http://localhost:8080  (API_PORT)  — `GET /health`
- Postgres :5433 · Redis :6380 (host ports, to avoid clashes)

## Concept

One entity: **Session** (`live` while running, `ended` once stopped) with an ordered
**event** log (`prompt` · `response` · `tool_call` · `file_write` · `output`).
Live events fan out over SSE backed by Redis pub/sub; ended sessions are archived and
replayable. See [CONTRACT.md](./CONTRACT.md) for the full API and design tokens.

## Capture a real Claude Code session

Merge `cli/settings.example.json` into your `~/.claude/settings.json` (or a project
`.claude/settings.json`) and set `LIVESHORTLY_API_URL=http://localhost:8080`. Every
Claude Code session then streams in live — `SessionStart` opens a session, tool/prompt
hooks emit events, `SessionEnd` stops it. See [cli/README.md](./cli/README.md).

## Auth (future)

No auth today: every request maps to the default user (`DEFAULT_USER_HANDLE`). The seam
is already in place — `sessions.owner_id`, an unused `api_tokens` table, and a single
auth middleware (`api/internal/auth`) where Bearer-token validation will slot in
without schema changes.
