# LiveShortly — API & Design Contract

Single source of truth for the Go API, the Next.js web app, and the Claude Code
capture hooks. All three MUST conform to this.

## Concept

One entity: **Session** — a shared agent/coding session. It is `live` while
running and `ended` once stopped. A session has an ordered **event** log.

No auth yet, but ownership is real: every session has an `owner_id`. An auth
middleware injects a default principal (the `you` user) today; turning on real
auth later must not require schema changes.

## Data shapes (JSON)

### Session
```json
{
  "id": "uuid",
  "title": "string",
  "owner_handle": "you",
  "model": "claude-opus-4-8 | null",
  "framework": "claude-code | null",
  "status": "live | ended",
  "tags": ["string"],
  "event_count": 0,
  "view_count": 0,
  "created_at": "RFC3339",
  "ended_at": "RFC3339 | null"
}
```

### Event
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "seq": 1,
  "actor": "agent | tool | viewer | null",
  "event_type": "prompt | response | tool_call | file_write | output",
  "payload": { "any": "json" },
  "ts": "RFC3339"
}
```

## HTTP API (base path on the api service, default port 8000)

| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/health` | — | `{"ok":true,"ts":"RFC3339"}` |
| POST | `/api/sessions` | `{"title"?,"model"?,"framework"?,"tags"?:[]}` | `201 {...Session,"url":"/session/{id}"}` |
| GET  | `/api/sessions?status=live\|ended\|all&q=&limit=&offset=` | — | `200 {"results":[Session],"total":int}` |
| GET  | `/api/sessions/{id}` | — | `200 {...Session,"events":[Event]}` (view_count++) |
| POST | `/api/sessions/{id}/events` | `{"event_type":string,"payload":object,"actor"?:string}` | `201 Event` |
| GET  | `/api/sessions/{id}/stream` | — | `200` SSE stream (see below) |
| POST | `/api/sessions/{id}/stop` | — | `200 {...Session}` (status=ended) |
| POST | `/api/sessions/{id}/comments` | `{"message":string}` | `201 Event` (viewer→session, live only) |
| GET  | `/api/sessions/{id}/comments/pending` | — | `200 {"comments":[{"username","message","ts"}]}` (drains once) |
| GET  | `/api/stats` | — | `200 {"total_sessions":int,"live_now":int,"ended":int,"total_events":int}` |

- `q` search: case-insensitive match on `title` OR any tag.
- `status` default `all`; `limit` default 30 (max 100); `offset` default 0.
- All write endpoints pass through the auth middleware → default user.
- CORS: allow origins from `CORS_ORIGINS` (default `*`), methods GET/POST/PATCH/DELETE/OPTIONS.

### SSE: `GET /api/sessions/{id}/stream`
Content-Type `text/event-stream`. Frames are `data: <json>\n\n`. Sequence:
1. `data: {"type":"connected","session_id":"...","status":"live|ended"}`
2. Replay every buffered event (in `seq` order) as `data: <Event json>` — so late joiners catch up.
3. Then stream live events as they are emitted.
4. Heartbeat comment `: ping\n\n` every 15s.
5. If/when the session ends, emit `data: {"type":"session_ended","session_id":"..."}` then close.
Dedupe by event `id` so a buffered event isn't sent twice.

## Live plumbing (Redis)
- `session:{id}:seq` — `INCR` to allocate the next event seq atomically.
- `session:{id}:buffer` — `RPUSH` each event JSON; `LRANGE 0 -1` to replay.
- `session:{id}:events` — pub/sub channel; `PUBLISH` each event JSON; SSE handlers `SUBSCRIBE`.
On stop: archive the buffer to storage as `sessions/{id}/raw.json`, persist events to
`session_events`, set `status='ended'`, `ended_at=now()`, publish a `session_ended`
control message, and delete the buffer key.

## Viewer comments → live session injection (bidirectional)
A viewer watching a LIVE session can send a message back into the running CLI session.
- `POST /api/sessions/{id}/comments` (live only): creates a normal event
  `event_type:"viewer_comment", actor:"viewer", payload:{message,username}` via the
  usual emit path (seq + persist + buffer + publish) so all SSE viewers and late
  joiners see it; ALSO `RPUSH session:{id}:pending` `{username,message,ts}` (EXPIRE 7200).
- `GET /api/sessions/{id}/comments/pending`: atomically drains `session:{id}:pending`
  (LRANGE 0 -1 + DEL) → `{comments:[...]}`. Called by the capture hook every prompt.
- Hook injection: the Claude Code `UserPromptSubmit` (and `PreToolUse`) hook calls the
  pending endpoint and returns the comments to Claude via
  `{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"...@user: msg..."}}`
  on stdout, prefixed with an instruction to address the viewer.

## Env vars (api)
`PORT` (8000), `DATABASE_URL`, `REDIS_URL`, `STORAGE_PATH` (/app/data/sessions),
`CORS_ORIGINS` (*), `DEFAULT_USER_HANDLE` (you).

## Web design — terminal HUD (light)
Aesthetic: a nerdy financial/terminal HUD on a warm paper background. Monospace
everywhere, boxed panels with hairline borders, UPPERCASE tracked labels, big
tabular numbers, a pulsing `● LIVE` badge, a live UTC clock.

Design tokens:
- bg paper `#f3f1e9`; panel `#faf9f4`; hairline border `#d9d6c9`; strong border `#1c1b17`
- ink `#1a1916`; muted `#6c6a5e`; faint `#9b998c`
- green `#1f7a4d` (live / positive); red `#c0392b` (ended / negative); amber `#b8860b`
- font stack: `'JetBrains Mono','IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,monospace`
- labels: `text-transform:uppercase; letter-spacing:0.12em; font-size:11px;` muted
- panels: 1px solid hairline, square corners, label top-left, value large
- dotted dividers (`border-bottom:1px dashed`)

Pages / tabs (minimal — only these):
- HUD header bar across the top: app mark, `● LIVE` status, live UTC clock, and stat
  panels `TOTAL SESSIONS`, `LIVE NOW` (from `/api/stats`).
- Tab nav with exactly two tabs: **LIVE** and **SESSIONS**, plus a search box.
  - LIVE: cards/rows of `status=live` sessions; each shows title, owner, model,
    event count, "started Xs ago", LIVE badge; click → `/session/{id}`.
  - SESSIONS: a monospace table of ALL sessions; columns ID(short) · TITLE · OWNER ·
    MODEL · EVENTS · STATUS · OPENED. Search box filters via `?q=`.
- `/session/{id}`: viewer. Header with session meta + LIVE/ENDED badge. A terminal
  event log: if live, subscribe to the SSE stream; if ended, the events come with
  the session GET. Render each event by type with a colored left marker; auto-scroll.

Web env: browser uses `NEXT_PUBLIC_API_URL`; server components use `API_INTERNAL_URL`
(falls back to public). Provide a `lib/api.ts` that picks the base by `typeof window`.

## Capture (Claude Code hooks)
Python hooks (stdlib only) under `cli/hooks/` read the hook JSON from stdin and call
the API. They map a Claude `session_id` → a LiveShortly session id stored under a
state dir. Hooks: SessionStart (POST /api/sessions, save mapping), UserPromptSubmit
(emit `prompt`), PreToolUse (emit `tool_call`), PostToolUse (emit `output`/`file_write`),
SessionEnd (POST stop). Config via `LIVESHORTLY_API_URL`. Ship a `.claude/settings.json`
hooks snippet and install docs.
