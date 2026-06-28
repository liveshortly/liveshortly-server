# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run the full stack
```bash
cp .env.example .env          # first time only
docker compose up -d --build  # start everything
docker compose down           # stop + remove containers
docker compose up -d --build web  # rebuild only the web (needed after NEXT_PUBLIC_API_URL change)
```

### API (Go)
```bash
cd api
go build ./...                # build check
go test ./...                 # run all tests
go run ./cmd/server           # run locally (needs Postgres + Redis on localhost)
```

### Web (Next.js)
```bash
cd web
npm install
npm run dev                   # dev server (port 3000)
npm run build                 # production build
```

### Health check
```bash
curl localhost:8000/health        # {"ok":true,...}
curl localhost:3000               # Next.js HTML
```

## Architecture

LiveShortly turns a Claude Code session into a live-streamed, replayable, shareable feed. The monorepo has three layers:

```
cli/hooks/   ← Python capture hooks fired by Claude Code events
api/         ← Go REST + SSE server (chi, pgx, go-redis)
web/         ← Next.js 15 App Router browser client
```

### Data flow

1. **Capture** — Claude Code fires Python hooks; `session_start.py` opens a session via `POST /api/sessions`. Subsequent hooks `POST` events. `user_prompt_submit.py` and `pre_tool_use.py` also drain `GET /api/sessions/{id}/comments/pending` and inject viewer messages into Claude via `hookSpecificOutput.additionalContext`.
2. **Fan-out** — `EmitEvent` handler: atomically `INCR session:{id}:seq` (Redis), persists to `session_events` (Postgres), `RPUSH session:{id}:buffer`, and `PUBLISH session:{id}:events`.
3. **Watch** — `GET /api/sessions/{id}/stream` replays the Redis buffer then subscribes; 15s heartbeats keep SSE connections alive.
4. **Talk back** — `POST /api/sessions/{id}/comments` emits a `viewer_comment` event via the normal path AND `RPUSH session:{id}:pending` (TTL 2h). The hook drains that queue atomically on its next fire.

### API package layout (`api/`)

| Package | Responsibility |
|---|---|
| `cmd/server/main.go` | Wires Postgres pool, Redis client, blob store, chi router; graceful shutdown. |
| `internal/config` | Reads env vars; all configuration is in `Config` struct. |
| `internal/auth` | `Authn` middleware — resolves a `Bearer` JWT or `ls_session` cookie to an `Identity`. |
| `internal/handlers` | One file per feature group: `sessions.go`, `events.go`, `stream.go`, `stop.go`, `comments.go`, `stats.go`, `shares.go`, `authweb.go` (Google OAuth), `device.go` (CLI device flow), `authz.go` (authorization helpers). |
| `internal/store` | All SQL via pgx. `Store` is the only place that knows about the schema. |
| `internal/bus` | All Redis operations: seq INCR, buffer RPUSH/LRANGE, pub/sub, pending queue. |
| `internal/storage` | Filesystem blob: archives the session event buffer as `sessions/{id}/raw.json` on stop. |
| `internal/websession` | JWT issue/verify for `ls_session` cookie and Bearer tokens. |
| `infra/postgres/init.sql` | Base schema. `infra/postgres/002-auth.sql` adds auth+sharing tables. |

### Web pages (`web/`)

- `app/page.tsx` — HUD home: `MY SESSIONS` + `SHARED WITH ME` tables, live stats header, tab nav.
- `app/session/[id]/` — Session viewer: SSE stream for live, static events for ended.
- `components/` — `HudHeader`, `Clock`, `SessionTable`, `EventStream`, `ShareDialog`, `PublicLinkDialog`, `AuthGate`, etc.
- `lib/api.ts` — All fetch wrappers; picks `NEXT_PUBLIC_API_URL` (browser) vs `API_INTERNAL_URL` (SSR).

### Auth (active)

Full auth is live. Every `/api` route (except `/api/me`) requires a principal resolved by `auth.Authn`:
1. `Authorization: Bearer <JWT>` (CLI access token, `typ=access`)
2. `ls_session` HttpOnly cookie (web JWT, `typ=web`)
3. → 401 otherwise

**Web login**: Google OAuth at `/auth/google/login` → `/auth/google/callback` → sets `ls_session` cookie.

**CLI login**: Device flow — `POST /auth/device/start` → poll `POST /auth/device/poll` → access+refresh tokens written to `~/.liveshortly/credentials.json`. Hooks auto-refresh on expiry.

**Authorization** is in `handlers/authz.go`: owner → full access; share grant (`session_shares` table) → `viewer`/`commenter`; `visibility=link|public` → public read; `link_role=commenter` → public comment.

### Contracts

**`CONTRACT.md`** — binding spec for the API endpoints, SSE protocol, Redis key schema, event types, and web design tokens. Always check it before adding/changing API surface.

**`AUTH.md`** — binding spec for auth endpoints, token format, sharing model, and CLI credential format.

### Design system

Terminal HUD aesthetic — monospace font (`JetBrains Mono` stack), hairline borders, UPPERCASE labels, warm paper background. Colors: paper `#f3f1e9`, panel `#faf9f4`, ink `#1a1916`, green `#1f7a4d` (live), red `#c0392b` (ended). Tailwind v4.

### Key env vars

`NEXT_PUBLIC_API_URL` is **baked into the browser bundle at build time** — changing it requires `docker compose up -d --build web`.

Auth requires: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URL`, `SESSION_SECRET`, `WEB_BASE_URL`.

### Production deploy

`docker-compose.prod.yml` + host nginx reverse proxy + Cloudflare TLS termination. See `deploy/DEPLOY.md` for the full procedure.
