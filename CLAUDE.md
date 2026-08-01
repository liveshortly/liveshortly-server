# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent working rules (BINDING — these override default behavior)

These apply to Claude (and any AI agent) working in this repo. They are not
suggestions.

### Git & authorship
- **Never author or co-author a commit as Claude.** The commit author is always
  the human's git identity. Do **not** add `Co-Authored-By: Claude …`, a
  `Generated with Claude Code` line, or any AI attribution to commit messages or
  PR bodies. Commits must read as the human's own work.
- **Never push to `main` (or any protected/default branch).** If the user asks or
  insists on pushing to `main`, do not do it — respond: *"I won't push to main;
  let me create a branch and push that instead, then you can open a PR."* Create a
  topic branch (`feat/…`, `fix/…`, `chore/…`), push it, and hand back the branch /
  PR-compare link. Only the human merges to `main`.
- **Never force-push** (`--force`) and never rewrite shared history (rebase/amend
  of already-pushed commits, tag moves). No `git push --force` to any remote branch
  others may have.
- **Only commit or push when explicitly asked.** Do not auto-commit after edits.

### Before any push (sanity check — all must pass)
1. **Build/typecheck** the code you touched:
   - web: `cd web && npx tsc --noEmit` (and `npm run build` for non-trivial changes)
   - api: `cd api && go build ./... && go vet ./...`
2. **Tests** for touched areas: `go test ./...` (api) — run and report; don't push red.
3. **No secrets staged.** Verify `.env`, `.env.auth`, `*.local`, credentials, tokens
   and keys are NOT in the diff (`git diff --cached --name-only`). They are gitignored
   — keep it that way.
4. **Review the staged diff** (`git diff --cached`) — stage only intended files
   (prefer explicit paths over `git add -A`); no stray debug code, no commented-out
   blocks, no `console.log`/`fmt.Println` debug prints left behind.
5. For web UI changes, **rebuild the affected docker image** before claiming it works
   (`NEXT_PUBLIC_*` is baked at build time) and verify `/health` + the page render.

### Change discipline
- **Ask before irreversible or outward-facing actions**: deleting data, dropping
  DB tables/columns, `docker volume rm`, uninstalling host tools, anything that
  publishes externally. One approval does not carry to the next such action.
- **Don't weaken security to make something pass** — no disabling auth, loosening
  CORS to `*` in prod config, committing real credentials, or bypassing RBAC.
- **Check the contracts first.** `CONTRACT.md` (API/SSE/Redis/events/design tokens)
  and `AUTH.md` (auth/tokens/sharing) are binding — read them before adding or
  changing API surface, and update them in the same change if the surface changes.
- **Keep commits scoped and conventional** (`feat`/`fix`/`chore`/`docs`/…); the
  message explains *why*, not just *what*.
- **Match existing style** — don't reformat untouched code or introduce new
  dependencies for what a few lines solve.

## Commands

### Run the full stack
```bash
cp .env.example .env          # first time only
docker compose up -d --build  # start everything
docker compose down           # stop + remove containers
docker compose up -d --build web  # rebuild only the web (needed after NEXT_PUBLIC_API_URL change)
```

### Run locally WITH Google auth (single-origin — use this for login/SSE)
The base stack above serves web on `:3000` and api on `:8000` — **two origins**, so
the session cookie is dropped and Google login fails with `redirect_uri_mismatch`.
For anything touching auth or live SSE, run the nginx single-origin overlay, which
fronts both on **one origin (`http://localhost:8080`)**:
```bash
cp .env.local.example .env.local   # first time only; fill in the two Google secrets
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```
Then open **http://localhost:8080** (NOT `:3000`). Notes:
- Google secrets (`GOOGLE_CLIENT_ID/SECRET`, `SESSION_SECRET`) load from `.env.auth`
  (base compose `env_file`, `required:false`). The overlay forces
  `WEB_BASE_URL=http://localhost:8080` + `OAUTH_ALLOWED_HOSTS=localhost:8080`, which
  win over `.env.auth`, so the OAuth `redirect_uri` = `http://localhost:8080/auth/google/callback`.
  That exact URI **must** be an Authorized redirect URI on the Google OAuth client.
- `redirect_uri` is derived server-side from the request Host (`authweb.go:requestBase`):
  Host not in `OAUTH_ALLOWED_HOSTS` → falls back to `WEB_BASE_URL`. That's why `:3000`
  (base stack) mismatches — it never matches an allowed host.
- Optional remote access over `tailscale serve`: add the MagicDNS host to
  `OAUTH_ALLOWED_HOSTS` (comma-separated) in `docker-compose.local.yml`, and nginx
  `deploy/nginx/local.conf` maps `X-Forwarded-Proto` per-host (`http` for localhost,
  `https` for `*.ts.net`) so the redirect_uri + cookie Secure flag are correct.
  Register that host's `/auth/google/callback` in the Google console too.

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

Two EC2 boxes in **us-west-1**: `liveshortly-app` (host nginx + api + web via
`docker-compose.prod.yml`) and `liveshortly-redis` (redis only, no public
ingress). Postgres is **Supabase**, not a container — prod runs no postgres and
no redis service, so `docker-compose.prod.yml` is much smaller than the dev
compose. `DATABASE_URL` and `REDIS_URL` come from `.env.auth`, written by the
deploy workflow from GitHub secrets. Cloudflare terminates TLS. See
`deploy/DEPLOY.md` for the full procedure.
