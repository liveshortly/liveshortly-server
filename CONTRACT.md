# LiveShortly — API & Design Contract

Single source of truth for the Go API, the Next.js web app, and the Claude Code
capture hooks. All three MUST conform to this.

## Concept

One entity: **Session** — a shared agent/coding session. It is `live` while
running and `ended` once stopped. A session has an ordered **event** log.

No auth yet, but ownership is real: every session has an `owner_id`. Capture
hooks identify the coding principal via the `X-LiveShortly-Handle` request header
(`user@hostname` derived on the CLI machine). Web clients without that header fall
back to `DEFAULT_USER_HANDLE`. Turning on real auth later must not require schema
changes.

## Data shapes (JSON)

### Session
```json
{
  "id": "uuid",
  "title": "string",
  "owner_handle": "alice@macbook-pro",
  "model": "claude-opus-4-8 | null",
  "framework": "claude-code | null",
  "status": "live | ended",
  "agent": "claude-code | gemini-cli | codex | ollama | terminal | null",
  "capture_mode": "hooks | pty | sdk | rollout | null",
  "tags": ["string"],
  "event_count": 0,
  "view_count": 0,
  "created_at": "RFC3339",
  "ended_at": "RFC3339 | null",
  "ended_reason": "quota | null",
  "bytes_used": 0,
  "fork_count": 0,
  "forked_from_id": "uuid | null",
  "forked_from_seq": "int | null",
  "forked_at": "RFC3339 | null"
}
```
`ended_reason` is `"quota"` when the session was auto-ended for crossing the
owner's storage limit, else null. `bytes_used` is this session's stored-payload
size (bytes) — its contribution to the owner's storage quota.
`agent` and `capture_mode` are optional capture metadata (how the session is
captured, reported by the Live shim); no behavior depends on them yet.
`GET /api/sessions/{id}` additionally returns `agent_connected: bool` — whether a
Live-shim agent stream is currently attached (presence) — `watcher_count: int`
(viewers watching right now, live only; an aggregate over anonymous presence
tokens) — plus fork lineage enrichments: `forker_count: int` (distinct users who
forked this session) and `forked_from: {id,title,owner_handle,seq} | null` (the
source when this session is itself a fork). `fork_count` is the denormalised total
of forks made from a session and is present on every row (feed/list included).

### Event
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "seq": 1,
  "actor": "agent | tool | viewer | null",
  "event_type": "prompt | response | tool_call | pre_tool | file_write | output | stream_end | viewer_comment | input_requested | viewer_decision | quota_exceeded",
  "payload": { "any": "json" },
  "ts": "RFC3339"
}
```

## HTTP API (base path on the api service, default port 8000)

| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/health` | — | `{"ok":true,"ts":"RFC3339"}` |
| POST | `/api/sessions` | `{"title"?,"model"?,"framework"?,"tags"?:[],"agent"?,"capture_mode"?, "forked_from"?, "forked_from_session_id"?, "forked_from_seq"?}` | `201 {...Session,"url":"/session/{id}","handoff"?:Bundle}` — `429` over the live-session cap, `413` over the storage cap (see Quotas) |
| POST | `/api/sessions/{id}/handoff` | `{"seq"?:int}` | `200 {"code","session_id","snapshot_seq","expires_at","command"}` (auth: any reader) |
| GET  | `/api/sessions?status=live\|ended\|all&q=&limit=&offset=` | — | `200 {"results":[Session],"total":int}` |
| GET  | `/api/feed?q=&cursor=&limit=` | — | `200 {"results":[Session],"next_cursor":string}` (public — anonymous OK; published only) |
| POST | `/api/sessions/{id}/publish` | — | `200 Session` (owner; lists in feed + public) |
| POST | `/api/sessions/{id}/unpublish` | — | `200 Session` (owner; removes from feed + private) |
| POST | `/api/sessions/{id}/typing` | — | `204` (ephemeral "viewer is typing" presence, live only) |
| GET  | `/api/sessions/{id}` | — | `200 {...Session,"events":[Event]}` (view_count++) |
| PATCH | `/api/sessions/{id}` | `{"title"?,"visibility"?,"link_role"?,"model"?}` | `200 Session` (owner only) |
| POST | `/api/sessions/{id}/events` | `{"event_type":string,"payload":object,"actor"?:string}` | `201 Event` — payload belt-capped to 256 KB before store; if this event crosses the owner's storage quota the response is `201 {...Event,"ended":true,"reason":"quota","summary_url","handoff_code","handoff_command"}` and the session is auto-ended |
| GET  | `/api/sessions/{id}/summary.md` | — | `200 text/markdown` (attachment; on-demand digest; same read auth as the session) |
| GET  | `/api/sessions/{id}/lineage` | — | `200 {"source":{id,title,owner_handle,seq}\|null,"snapshot_seq":int,"events":[Event],"restricted":bool}` (auth: any reader of the fork; see Handoff / fork) |
| GET  | `/api/sessions/{id}/stream` | — | `200` SSE stream (see below) |
| GET  | `/api/sessions/{id}/agent/stream` | — | `200` agent SSE stream (owner only, Bearer; see below) |
| POST | `/api/sessions/{id}/stop` | — | `200 {...Session}` (status=ended) |
| POST | `/api/sessions/{id}/comments` | `{"message":string}` | `201 Event` (viewer→session, live only) |
| GET  | `/api/sessions/{id}/comments/pending` | — | `200 {"comments":[{"username","message","ts"}]}` (drains once) |
| POST | `/api/sessions/{id}/decision` | `{"decision":"allow"\|"deny"}` | `201 Event` (viewer answers a permission prompt, live only) |
| GET  | `/api/sessions/{id}/decision` | — | `200 {"decision":"allow"\|"deny"\|null,"watchers":int}` (owner; pops once) |
| GET  | `/api/stats` | — | `200 {"total_sessions":int,"live_now":int,"ended":int,"total_events":int}` |
| GET  | `/api/me/activity` | — | `200 {"results":[ActivityItem]}` (caller's own recent activity, newest first, capped at 6) |
| PATCH | `/api/admin/users/{id}/quota` | `{"storage_limit_bytes"?:int\|null,"max_live_sessions"?:int\|null,"quota_exempt"?:bool}` | `200 QuotaUsage` (super-admin; a null field clears that override to the default) |

`ActivityItem`: `{"kind":"went_live"\|"published"\|"comment"\|"share","actor"?:string,"session_id":string,"session_title":string,"ts":string}`.
`went_live`/`published` are the caller's own sessions (no `actor`); `comment` is a
`viewer_comment` event on a session the caller owns (`actor` = commenter's handle);
`share` is a grant where the caller is the `grantee` (`actor` = the granter's
handle). Merged from `sessions`, `session_events` and `session_shares` — no new
tables, no persisted "activity log".

- `q` search: case-insensitive match on `title` OR any tag.
- `status` default `all`; `limit` default 30 (max 100); `offset` default 0.
- All write endpoints pass through the auth middleware. CLI hooks send
  `X-LiveShortly-Handle: <user@hostname>`; other clients use `DEFAULT_USER_HANDLE`.
- CORS: allow origins from `CORS_ORIGINS` (default `*`), methods GET/POST/PATCH/DELETE/OPTIONS.
  Allowed headers include `X-LiveShortly-Handle`.

### SSE: `GET /api/sessions/{id}/stream`
Content-Type `text/event-stream`. Frames are `data: <json>\n\n`. Sequence:
1. `data: {"type":"connected","session_id":"...","status":"live|ended"}`
2. Replay every buffered event (in `seq` order) as `data: <Event json>` — so late joiners catch up.
3. Then stream live events as they are emitted.
4. Heartbeat comment `: ping\n\n` every 15s. Alongside each heartbeat (and once
   on connect) emit `data: {"type":"watchers","count":int}` — the live audience size.
5. If/when the session ends, emit `data: {"type":"session_ended","session_id":"..."}` then close.
Dedupe by event `id` so a buffered event isn't sent twice.

### SSE: `GET /api/sessions/{id}/agent/stream` (Live shim)
The agent-facing push channel for the Live shim (`live claude`), so it no longer
polls `/comments/pending`. **Owner only**, behind the auth middleware (Bearer
access token `typ=access` or cookie — NOT anonymous). Content-Type
`text/event-stream`. Sequence:
1. `data: {"type":"connected","session_id":"..."}`
2. Replay the pending viewer queue **without draining it** — each queued comment
   as `data: {"type":"viewer_comment","comment":<pending JSON>}`.
3. Then forward every message published to `session:{id}:agent`:
   - `data: {"type":"viewer_comment","comment":{username,message,ts}}`
   - `data: {"type":"viewer_decision","decision":"allow|deny","username":"..."}`
4. Heartbeat comment `: hb\n\n` every 15s.
5. On stop, `data: {"type":"session_ended","session_id":"..."}` then close.

**Ack via drain.** Pushes do NOT remove anything from `session:{id}:pending`; the
shim acks by calling `GET /api/sessions/{id}/comments/pending` (the existing
atomic drain) after it has handled a message. So a reconnect replays anything
not yet acked for free, and duplicates between a live push and a later drain are
the client's problem. `POST …/comments` and `POST …/decision` publish to
`session:{id}:agent` in addition to their existing queue/emit behavior.

## Hosts (web-spawned sessions)
A **host** is one of the caller's own machines running `live daemon`. It holds a
command stream open so the owner can start a session from the browser instead of
typing `live <agent>` in a terminal. Hosts are Redis-only — an offline machine
is not listed, because it is not spawnable.

### Host
```json
{
  "id": "laptop",           // daemon-chosen, [A-Za-z0-9_-]{1,64}
  "name": "rohit's macbook",
  "hostname": "rohit-mbp", "os": "darwin", "arch": "arm64",
  "dirs":   ["/Users/rohit/code/api"],   // absolute; the spawn allowlist
  "agents": ["claude","codex"],          // subset of claude|codex|gemini|ollama
  "models": ["llama3.2:1b"],             // ollama only; the model allowlist
  "seen_at": "RFC3339"
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/hosts/register` | `{"host_id","name"?,"hostname"?,"os"?,"arch"?,"dirs":[abs paths],"agents":[…],"models"?:[…]}` | `200 {"host_id","ttl_secs","registered":true}` — `400` on a bad id, a relative path, or no supported agent |
| GET | `/api/hosts` | — | `200 {"hosts":[Host]}` — the caller's ONLINE machines only |
| GET | `/api/hosts/{id}/stream` | — | `200` SSE command stream (owner only, Bearer) — `404` if the host has not registered |

`POST /api/sessions` gains `{"host_id"?, "cwd"?}`. When `host_id` is set, `agent`
is read as a **spawnable binary name** (`claude`/`codex`/`gemini`/`ollama`), not a
framework label — the server maps it to the same `framework`/`capture_mode` the
CLI would have reported. For `ollama`, `model` names which model to run and MUST
be one the host registered (empty → the host's first); it is rejected with `400`
otherwise, and ignored for every other agent. The response carries
`"spawn": {"host_id","agent","cwd","status":"requested"|"failed","error"?}`.
`requested` means the command was published, NOT that the agent is up; the
session page tracks that separately via `agent_connected`.

### SSE: `GET /api/hosts/{id}/stream` (daemon)
Frames: `{"type":"connected","host_id"}`, then
`{"type":"spawn","session_id","agent","cwd","title","model"?}` per web-created
session (`model` only for `ollama`),
plus `: hb` comments every 15s. Each heartbeat refreshes the host record, so the
machine leaves the picker ~90s after the daemon dies (immediately on a clean
disconnect).

### Security model (binding)
A spawn command is remote code execution on the owner's machine, authorized by
their web session. Three rules bound it, and the daemon re-checks all three
locally because it must not trust the server:
1. The server **never sends an argv** — only an agent NAME from a fixed
   allowlist. The daemon builds the command line itself.
2. The working directory must be one the **daemon itself registered**. Both ends
   reject anything else; `filepath.Clean` runs before the check so traversal
   cannot escape the allowlist.
3. Every Redis key is namespaced by the owning user id, so a host id guessed or
   replayed by another user addresses a different key space and can never reach
   this user's machine.

Validation runs **before** the session row is created, so a bad host/dir/agent
never leaves an orphaned live session against the caller's concurrency quota.

## Live plumbing (Redis)
- `session:{id}:seq` — `INCR` to allocate the next event seq atomically.
- `session:{id}:buffer` — `RPUSH` each event JSON; `LRANGE 0 -1` to replay.
- `session:{id}:events` — pub/sub channel; `PUBLISH` each event JSON; SSE handlers `SUBSCRIBE`.
- `session:{id}:watchers` — ZSET of live SSE connections (member=conn token,
  score=expiry ns); refreshed every heartbeat, pruned on read. `ZCARD` after
  prune = live watcher count. TTL ~40s so a dead tab clears quickly.
- `session:{id}:decision` — viewer allow/deny queue (`RPUSH`/`LPOP`, TTL ~2m).
- `session:{id}:agent` — pub/sub channel for the Live shim's agent stream;
  `PUBLISH` viewer_comment/viewer_decision/session_ended frames. Separate from
  `:events`; never touches the replay buffer or the `:pending` queue.
- `session:{id}:agent_connected` — presence flag (`SET "1"` TTL ~45s, refreshed
  each heartbeat, `DEL` on disconnect); exposed as `agent_connected` on the
  session JSON.
- `session:{id}:agent_seen` — durable marker (`SET "1"`, TTL ~30d) set on first
  agent-stream connect. The abandoned-agent reaper only ends sessions that have
  it, so legacy plugin/hook sessions (which never open an agent stream) are never
  reaped.
- `host:{user}:{host}` — host record JSON (`SET`, TTL 90s, refreshed each
  heartbeat of the host stream). Its presence IS the "machine is online" signal.
- `host:{user}:{host}:cmd` — pub/sub channel carrying spawn commands to that
  machine's `live daemon`.
- `user:{user}:hosts` — SET of host ids; `HostList` prunes ids whose record has
  lapsed, so a crashed daemon self-heals out of the picker.
On stop: archive the buffer to storage as `sessions/{id}/raw.json`, persist events to
`session_events`, set `status='ended'`, `ended_at=now()`, publish a `session_ended`
control message, and delete the buffer key.

## Viewer comments → live session injection (bidirectional)
A viewer watching a LIVE session can send a message back into the running CLI session.
- `POST /api/sessions/{id}/comments` (live only): creates a normal event
  `event_type:"viewer_comment", actor:"viewer", payload:{message,username}` via the
  usual emit path (seq + persist + buffer + publish) so all SSE viewers and late
  joiners see it; ALSO `RPUSH session:{id}:pending` `{username,message,ts}` (EXPIRE 25200 = 7h,
  kept in step with the live-session idle timeout).
- `GET /api/sessions/{id}/comments/pending`: atomically drains `session:{id}:pending`
  (LRANGE 0 -1 + DEL) → `{comments:[...]}`. Called by the capture hook every prompt.
- Hook injection: the Claude Code `UserPromptSubmit` (and `PreToolUse`) hook calls the
  pending endpoint and returns the comments to Claude via
  `{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"...@user: msg..."}}`
  on stdout, prefixed with an instruction to address the viewer.

## Input/permission requests → web (Notification hook)
When the CLI waits for the developer — a tool permission prompt or an idle input
wait — Claude Code fires the `Notification` hook. The capture client emits
`event_type:"input_requested", payload:{message,kind,ts}` where `kind ∈ {permission,input}`.
The web viewer renders an amber banner with the message; a watching viewer can type
a reply in the composer, which is injected on the session's next turn.

This is **non-blocking by design**: the CLI is never stalled waiting on the web —
the developer answers the prompt in the terminal as usual, and the banner clears as
soon as any later activity event supersedes the request. (The `POST/GET
…/decision` endpoints and the `viewer_decision` event remain in the API but are not
used by the default hooks.)

## Feed (publish)
Publishing lists a session in the public, discoverable feed and makes it readable by
anyone, signed in or not (it replaces the old "share to all" unlisted link, and
doubles as the anonymous landing page).
- `POST …/publish` sets `published_at=now()`, `visibility='public'`, precomputes a
  `hero` snippet (opening prompt → notable edit → title) and a `search_vector`
  (`tsvector`: title^A + hero^B + tags^C). `POST …/unpublish` reverses it.
- `GET /api/feed` (public — `auth.OptionalAuthn`, no sign-in required) returns
  published sessions. Browsing pages by keyset cursor on `(published_at, id)`;
  `?q=` switches to `ts_rank` relevance (offset cursor). `next_cursor` is an
  opaque base64 token; empty = end of feed.
- Feed tiles are synthesized from Session fields + `hero` (no image); `published_at`
  and `hero` are part of the Session shape.

## Handoff / fork (continue a session as a new one)
A handoff lets a user continue any session **they can read** (live or archived,
possibly someone else's) as a **new session they own**, with any agent. The
source session is never modified; only its denormalised `fork_count` is bumped.

- **Fidelity.** The server never stored the raw agent transcript — only the feed
  (truncated `prompt`/`response` content + tool/edit summaries). So a handoff is a
  **reconstructed briefing**, not a byte-exact resume. The server assembles it
  deterministically (no LLM); the forking user's own agent does the comprehension.
- `POST /api/sessions/{id}/handoff` (auth: any reader — owner, share, or
  link/public/open) mints a **signed handoff code** pinned at a snapshot seq
  (default = current max seq, "the moment the handoff is generated"). Returns
  `{code, session_id, snapshot_seq, expires_at, command}` where `command` is the
  ready-to-copy `live <agent> --handoff <code>`. Codes are stateless (HMAC over
  `session_id|seq|exp` with `SESSION_SECRET`, 7-day TTL) — **not** a capability;
  authorization is always re-checked at fork time.
- **Redeem** via `POST /api/sessions` with **one of** `forked_from` (a code) or
  `forked_from_session_id` (+ optional `forked_from_seq`; default latest). The
  server re-checks `canRead` for the **redeeming** principal (403 otherwise),
  creates the new session owned by them with lineage columns set
  (`forked_from_session_id`, `forked_from_seq`, `forked_at`), increments the
  source's `fork_count`, and returns the new Session plus a `handoff` **Bundle**:
  ```json
  {
    "markdown": "string (ready to seed the agent)",
    "turns": [{"seq":int,"role":"user|assistant|tool","text":"string","tool"?:"string","file"?:"string"}],
    "source": {"id","title","owner_handle","agent","git_remote","git_branch","model","status","created_at","ended_at","snapshot_seq"},
    "truncated": false
  }
  ```
  The client writes `markdown` to a file and launches its agent seeded with it.
- **Prior context (full-history view)** via `GET /api/sessions/{id}/lineage`: for a
  fork, returns the **source** session's events up to `forked_from_seq` so the UI
  and CLI can render the entire session (source ≤ seq, then the fork's own events)
  without physically copying anything — a virtual, copy-on-write view. This is a
  human/replay surface; the agent is still seeded by the `handoff` **Bundle**
  digest, not by replaying every prior turn. RBAC is re-checked on **both** the
  fork (to view it) and the **source** (to see its events); no source access →
  `restricted:true` with `events:[]` (the fork still renders). A non-fork returns
  `source:null, events:[]`. A deleted source returns the stored ref with no events.
  Note the source's events keep their own `seq` (each session numbers from 1), so
  clients must render lineage as a distinct prior-context block, **not** merge it
  into the fork's seq-sorted feed.

## Typing presence (ephemeral)
`POST …/typing` (commenter, live only) publishes a control frame
`{"type":"typing","who","actor":"viewer","until":<unix-ms>}` to the session channel
ONLY — never persisted or buffered, so it is absent from replay. SSE clients show an
"@who is typing" indicator until `until`. "Claude is working" is derived client-side
from live stream state (last event is active work, turn not ended).

## Model reporting
A fresh session is created without a model (no assistant turn exists yet). The
capture client reads the JSONL transcript (`message.model` on assistant turns)
and, on resume, passes it to `POST /api/sessions`; for fresh sessions it reports
the model once known via `PATCH /api/sessions/{id}` `{"model":...}` (owner only).

## Quotas (per-user resource limits)

Every user has two limits, enforced launch-wide:

- **Storage** — total stored session data, metered as the byte size of each
  `session_events.payload` (the archived stop-time blob is derived, not counted).
  Default 100 MB (`DEFAULT_STORAGE_LIMIT_BYTES`). Reclaimable: deleting a session
  frees its `bytes_used` from the owner's total.
- **Concurrency** — simultaneous `live` sessions. Default 10
  (`DEFAULT_MAX_LIVE_SESSIONS`). Enforced race-safe (a `FOR UPDATE` lock on the
  owner row serializes parallel creates), so two `live claude` calls can't both
  slip past the cap.

Accounting is denormalized: `users.storage_bytes_used` and `sessions.bytes_used`
are maintained in the same transaction as each event insert / session delete, so
enforcement never scans the event log.

Enforcement points:
- `POST /api/sessions` → `429` at the concurrency cap, `413` at the storage cap.
- `POST /api/sessions/{id}/events` — every payload is belt-capped to **256 KB**
  before store (a fixed safety ceiling, not configurable). The event that crosses
  the storage limit is stored, then the session is auto-ended
  (`status=ended`, `ended_reason=quota`), a `quota_exceeded` feed event is emitted,
  and the response carries `{ended, reason:"quota", summary_url, handoff_code,
  handoff_command}` so the capture client stops and can continue via handoff.

Per-user overrides (super-admin, via `PATCH /api/admin/users/{id}/quota`):
`storage_limit_bytes` / `max_live_sessions` (null → config default) and
`quota_exempt` (true → both checks bypassed). `GET /api/me` and
`GET /api/admin/users` return each user's usage + effective limits.

## Env vars (api)
`PORT` (8000), `DATABASE_URL`, `REDIS_URL`, `STORAGE_PATH` (/app/data/sessions),
`CORS_ORIGINS` (*), `DEFAULT_USER_HANDLE` (you),
`DEFAULT_STORAGE_LIMIT_BYTES` (`104857600` = 100 MB) and `DEFAULT_MAX_LIVE_SESSIONS`
(`10`) — per-user quota defaults (per-user overrides live in the DB),
`LIVE_AGENT_GRACE` (`10m`) — how long a Live-shim session whose agent stream has
gone away may stay idle before the abandoned-agent reaper ends it (Go duration).

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
