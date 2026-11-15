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
source when this session is itself a fork). It also returns the **model-picker
catalog for this session's agent** (owner only — empty for non-owners):
`models: [{id,label}]`, `default_model: string` (optional), `model_switchable:
bool`. This is computed at READ time (no DB column — the spawn host is not
persisted): the server unions the `agent_models` entries for this session's
agent across the owner's currently-online hosts (the same source `GET /api/hosts`
uses), deduping by `id` and OR-ing `model_switchable`. With no online host
offering that agent, `models` is `[]` and `model_switchable` falls back to the
harness default for the agent (claude/pi → true) so the web can still show the
current model with no switch options. The dropdown feeds the chosen `id` back to
`POST …/model`; for pi that `id` is the `<provider>/<modelId>` form that
endpoint's validation accepts. `fork_count` is the denormalised total
of forks made from a session and is present on every row (feed/list included).
`GET /api/sessions/{id}` also returns `persisted: bool` — whether the server is
keeping this session's transcript. It is always `true` unless relay-only mode is
on (see **Relay-only mode**); under relay-only it is `true` only once the session
has been published. A viewer loading an `ended` session with `persisted:false`
gets `events:[]` and should render a "not kept — this session was never
published" state rather than an empty transcript.

### Event
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "seq": 1,
  "actor": "agent | tool | viewer | null",
  "event_type": "prompt | response | tool_call | pre_tool | file_write | output | stream_end | viewer_comment | input_requested | viewer_decision | quota_exceeded | bypass_changed | question_requested",
  "payload": { "any": "json" },
  "ts": "RFC3339"
}
```

## HTTP API (base path on the api service, default port 8000)

| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/health` | — | `{"ok":true,"ts":"RFC3339"}` |
| POST | `/api/sessions` | `{"title"?,"model"?,"framework"?,"tags"?:[],"agent"?,"capture_mode"?, "forked_from"?, "forked_from_session_id"?, "forked_from_seq"?}` | `201 {...Session,"url":"/session/{id}","handoff"?:Bundle}` — `429` over the live-session cap, `413` over the storage cap (see Quotas) |
| GET  | `/api/sessions/{id}/seed` | — | `200 {"handoff": Bundle\|null}` (owner) — the briefing a forked session seeds its agent with; null if not a fork. The daemon calls it after attaching a web-spawned "continue". |
| POST | `/api/sessions/{id}/handoff` | `{"seq"?:int}` | `200 {"code","session_id","snapshot_seq","expires_at","command"}` (auth: any reader) |
| GET  | `/api/sessions?status=live\|ended\|all&q=&limit=&offset=` | — | `200 {"results":[Session],"total":int}` — list rows also carry `last_event: {"type","snippet","ts"} \| absent`, the newest prompt/response/viewer_comment as a one-line summary (snippet ≤140 chars), `suggested_title` (prompt-derived, never-renamed rows only; redacted on shared rows) and `unread` (events after the caller's read mark; absent/0 when never opened). Page past 100 with `offset` against `total` |
| GET  | `/api/feed?q=&cursor=&limit=` | — | `200 {"results":[Session],"next_cursor":string}` (public — anonymous OK; published only) |
| POST | `/api/sessions/{id}/publish` | — | `200 Session` (owner; lists in feed + public) |
| POST | `/api/sessions/{id}/unpublish` | — | `200 Session` (owner; removes from feed + private) |
| POST | `/api/sessions/{id}/typing` | — | `204` (ephemeral "viewer is typing" presence, live only) |
| POST | `/api/sessions/{id}/seen` | `{"seq"?:int}` | `204` — the caller's read mark (any reader; auth required): seen up to `seq`, clamped to the latest, or the latest when omitted. Never moves backwards |
| GET  | `/api/sessions/{id}?since_seq=` | — | `200 {...Session,"events":[Event]}` (view_count++ once per page view: not on a `since_seq` tail fetch, nor with `?view=0`, which a server render passes when the browser will refetch). Carries `suggested_title` like list rows (redacted for non-owners). `since_seq` is optional: when given, `events` carries only those with `seq > since_seq`, so a client holding the earlier ones refetches just the tail; omitted (or `0`) returns the full list, which is what every existing client gets. The session's own `event_count` remains the authoritative total, so a client can tell whether it is missing anything. A value that is not a non-negative integer is `400`, not a silent full response |
| PATCH | `/api/sessions/{id}` | `{"title"?,"visibility"?,"link_role"?,"model"?}` | `200 Session` (owner only) |
| POST | `/api/sessions/{id}/events` | `{"event_type":string,"payload":object,"actor"?:string}` | `201 Event` — payload belt-capped to 256 KB before store; if this event crosses the owner's storage quota the response is `201 {...Event,"ended":true,"reason":"quota","summary_url","handoff_code","handoff_command"}` and the session is auto-ended |
| GET  | `/api/sessions/{id}/summary.md` | — | `200 text/markdown` (attachment; on-demand digest; same read auth as the session) |
| GET  | `/api/sessions/{id}/lineage` | — | `200 {"source":{id,title,owner_handle,seq}\|null,"snapshot_seq":int,"events":[Event],"restricted":bool}` (auth: any reader of the fork; see Handoff / fork) |
| GET  | `/api/sessions/{id}/stream` | — | `200` SSE stream (see below) |
| GET  | `/api/sessions/{id}/agent/stream` | — | `200` agent SSE stream (owner only, Bearer; see below) |
| POST | `/api/sessions/{id}/stop` | — | `200 {...Session}` (status=ended) |
| POST | `/api/sessions/{id}/model` | `{"model":string}` | `200 {"ok":true,"model"}` (owner, live) — claude: alias → tmux; pi: catalog id → agent stream. See Hosts §. `400`/`409`/`502` |
| POST | `/api/sessions/{id}/abort` | — | `200 {"ok":true}` (owner, live) — "Stop current action"; emits `abort` on the session's agent stream. `409` ended, `502` undeliverable |
| POST | `/api/sessions/{id}/comments` | `{"message":string,"images"?:["<base64 data URL>"]}` | `201 Event` (viewer→session, live only). `images` optional (≤3, each an image data URL ≤2 MB decoded) are delivered out-of-band as `attach_image` frames and never stored/broadcast; `400` on a bad image |
| GET  | `/api/sessions/{id}/comments/pending` | — | `200 {"comments":[{"username","message","ts"}]}` (drains once) |
| POST | `/api/sessions/{id}/decision` | `{"decision":"allow"\|"deny"}` | `201 Event` (viewer answers a permission prompt, live only) |
| GET  | `/api/sessions/{id}/decision` | — | `200 {"decision":"allow"\|"deny"\|null,"watchers":int}` (owner; pops once) |
| POST | `/api/sessions/{id}/bypass` | `{"enabled":bool}` | `200 {"bypass_all":bool}` (owner, live only) — skip-all-permissions: while on, every permission request is auto-answered `allow` and the prompt is **not** broadcast (no `input_requested` event, no viewer popup) |
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
2. Replay every buffered event (in `seq` order) as `id: <seq>\ndata: <Event json>` — so late joiners catch up.
   **Resume:** send `Last-Event-ID: <seq>` (the highest event `seq` already held;
   EventSource does this itself on reconnect) and only events with `seq` > that
   are replayed. A first connect that can't set headers may pass
   `?last_event_id=<seq>` instead; the header wins if both are present. Absent,
   empty or non-numeric → full replay. Ended sessions honour it the same way.
3. Then stream live events as they are emitted (`id: <seq>` on every event frame;
   control frames — `connected`, `watchers`, `typing`, `session_ended`… — carry no `id:`).
4. Heartbeat comment `: ping\n\n` every 15s. Alongside each heartbeat (and once
   on connect) emit `data: {"type":"watchers","count":int}` — the live audience size.
5. If/when the session ends, emit `data: {"type":"session_ended","session_id":"..."}` then close.
The server subscribes before reading the buffer, so an event emitted mid-replay
is never missed, and it dedupes by `seq` so it is never sent twice. Clients
should still dedupe by `seq`/`id` (concurrent emits can arrive slightly out of
`seq` order).

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
   - **Mid-session commands** (owner → headless session; see `POST …/model` and
     `POST …/abort`):
     - `data: {"type":"set_model","session_id","model":"<provider>/<modelId>"}`
     - `data: {"type":"abort","session_id"}`
     - `data: {"type":"attach_image","session_id","index":<N>,"mime":"image/png","data":"<base64>"}`
       — a viewer image pasted with a comment (see `POST …/comments`). The base64
       rides only this frame, never the stored/broadcast `viewer_comment` event.
       One frame per image, published **before** the comment that references them,
       so the sidecar buffers them and attaches to that comment on delivery (pi:
       as prompt image parts; text agents: temp-file paths appended to the text).
4. Heartbeat comment `: hb\n\n` every 15s.
5. On stop, `data: {"type":"session_ended","session_id":"..."}` then close.

**Command dispatch is extensible.** Every frame is a flat `{"type",...}` object;
the sidecar switches on `type` (`viewer_comment`/`viewer_decision` → drain,
`set_model`/`abort` → the matching callback, `session_ended` → close) and ignores
types it does not know. A new command type (e.g. a future `attach_image` carrying
a base64 payload the sidecar hands to the agent as an image input) is one more
`type` plus its payload fields and one dispatch case on the sidecar — **no new
endpoint plumbing or transport change**. Command delivery is best-effort (unlike
viewer comments, commands are not queued in `:pending`, so a command issued while
the sidecar is mid-reconnect is dropped — the caller retries).

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
  "agents": ["claude","codex","hermes"], // whatever the daemon found locally
  "models": ["llama3.2:1b"],             // ollama only; legacy, kept one release
  "agent_models": [                      // per-agent model allowlist (LSH-16); always present in GET
    {"name": "claude", "models": [{"id": "opus", "label": "Opus"}], "default_model"?: "opus", "model_switchable"?: true},
    {"name": "hermes", "models": []}     // empty: the agent runs its own default
  ],
  "seen_at": "RFC3339"
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/hosts/register` | `{"host_id","name"?,"hostname"?,"os"?,"arch"?,"dirs":[abs paths],"agents":[…],"models"?:[…],"agent_models"?:[…]}` | `200 {"host_id","ttl_secs","registered":true}` — `400` on a bad id, a relative path, no valid agent left, or only `ollama` with no `models` |
| GET | `/api/hosts` | — | `200 {"hosts":[Host]}` — the caller's ONLINE machines only |
| GET | `/api/hosts/{id}/stream` | — | `200` SSE command stream (owner only, Bearer) — `404` if the host has not registered |

`agents` is not a fixed list: the server does not police which harnesses exist,
only that each entry is a safe name. Malformed or duplicate names are dropped
(not a `400`), the rest capped at 32. The daemon re-checks any spawn locally.

`POST /api/sessions` gains `{"host_id"?, "cwd"?, "bypass_permissions"?}`. When
`host_id` is set, `agent` is read as a **spawnable agent name**, not a
framework label — the server maps the ones it knows (`claude`, `codex`,
`gemini`, `ollama`, `agy`) to the same `framework`/`capture_mode` the CLI would
have reported, and anything else to the generic pty capture the CLI uses for an
agent it does not know.

Agent names are **not a fixed set**. A machine advertises whatever harnesses it
found locally — probed on `PATH`, plus the operator's own
`~/.liveshortly/agents.json` — so the server validates only that a name is a
bounded, plain `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` token and that it is one the
target host actually registered. Adding a harness is a client-side act and
needs no API change.

`model` (LSH-16) MUST be on the target host's `agent_models` list **for that
agent**, else `400`; empty means the agent's own default (for `ollama`, which
needs one: the entry's `default_model`, else its first). An agent with an
empty list takes no model. Registration drops entries for agents the host did
not register, ids outside `[A-Za-z0-9._:/-]{1,128}` or starting with `-`, and a
`default_model` not on the list. A host registered without `agent_models` (a
daemon that predates it) is treated as `claude` → `opus|sonnet|haiku` and
`ollama` → `models`, which is exactly what such a daemon accepts. The daemon
re-checks the model against the catalog it built itself and passes it as the
agent's own model flag (one argv element, never a shell). `bypass_permissions` (bool) asks the daemon to run the agent
unattended — no permission probes; it is relayed as a boolean only (rule 1
below: never an argv) and the daemon maps it to known flags
(`live --no-permissions`, plus `claude --dangerously-skip-permissions` /
`gemini --yolo`). The response carries
`"spawn": {"host_id","agent","cwd","status":"requested"|"failed","error"?}`.
`requested` means the command was published, NOT that the agent is up; the
session page tracks that separately via `agent_connected`.

`POST /api/sessions/{id}/model` `{"model":...}` (owner, session live) relays a
model switch. Delivery depends on the session's agent:
- **claude** (tmux): `{"model":"sonnet"|"opus"|"haiku"}`. The server publishes
  `{"type":"set_model","session_id","model"}` to EVERY online machine of the
  owner (the spawn host is not persisted); the daemon hosting the session's tmux
  pane types `/model <alias>` into it, the rest no-op. Alias allowlist on both
  ends. `400` unknown alias / no machine online.
- **pi** (headless, no tmux pane): `{"model":"<provider>/<modelId>"}` — a catalog
  id, charset `[A-Za-z0-9._:/-]{1,128}`, not leading `-`. The server publishes
  `{"type":"set_model","session_id","model"}` on the **session's agent stream**
  (`session:{id}:agent`), which the sidecar receives and hands to pi's `set_model`
  RPC. `400` malformed id, `502` could not deliver.

Never an argv on either path. `409` if the agent can't switch models mid-session,
or the session has ended. `200 {"ok":true,"model"}` on success.

`POST /api/sessions/{id}/abort` (owner, session live) — the "Stop current action"
button. Agent-aware, mirroring `…/model`:
- **claude** (tmux): the server publishes `{"type":"abort","session_id"}` to EVERY
  online machine of the owner over the HostStream; the daemon hosting the pane
  sends **Escape** (claude's interrupt — cancels the running turn without killing
  the session), the rest no-op. `400` if no machine is online.
- **pi** (headless): `{"type":"abort","session_id"}` on the session's agent stream
  (`session:{id}:agent`), which the sidecar maps to pi's abort RPC.

No body. `409` ended, `400`/`502` undeliverable, `200 {"ok":true}` on success.

### SSE: `GET /api/hosts/{id}/stream` (daemon)
Frames: `{"type":"connected","host_id"}`, then per web-created session
`{"type":"spawn","session_id","agent","cwd","title","model"?,"bypass_permissions"?}`
(`model` from that host's `agent_models` for the agent; `bypass_permissions` a
boolean the daemon maps to known flags, never an argv), and
`{"type":"set_model","session_id","model"}` for live model switches,
`{"type":"abort","session_id"}` for a claude Stop (the daemon sends Escape into
the pane), plus `: hb` comments every 15s. Each heartbeat refreshes the host record, so the
machine leaves the picker ~90s after the daemon dies (immediately on a clean
disconnect).

### Security model (binding)
A spawn command is remote code execution on the owner's machine, authorized by
their web session. Three rules bound it, and the daemon re-checks all three
locally because it must not trust the server:
1. The server **never sends an argv** — only an agent NAME the host itself
   registered. The daemon builds the command line itself.
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
- `session:{id}:bypass` — skip-all-permissions flag (`SET`/`DEL`, TTL 24h). While set, `EmitEvent` auto-pushes an `allow` decision for each permission `input_requested` and returns `201 {"bypassed":true}` **without** emitting the event, so the prompt never reaches the replay buffer or any viewer.
- `session:{id}:agent` — pub/sub channel for the Live shim's agent stream;
  `PUBLISH` viewer_comment/viewer_decision/session_ended frames, plus owner
  mid-session commands (set_model/abort, extensible). Separate from `:events`;
  never touches the replay buffer or the `:pending` queue (so commands are
  best-effort, not replayed on reconnect).
- `session:{id}:agent_connected` — presence flag (`SET "1"` TTL ~45s, refreshed
  each heartbeat, `DEL` on disconnect); exposed as `agent_connected` on the
  session JSON.
- `session:{id}:agent_seen` — durable marker (`SET "1"`, TTL ~30d) set on first
  agent-stream connect. The abandoned-agent reaper only ends sessions that have
  it, so legacy plugin/hook sessions (which never open an agent stream) are never
  reaped.
- `host:{user}:{host}` — host record JSON (`SET`, TTL 90s, refreshed each
  heartbeat of the host stream). Its presence IS the "machine is online" signal.
- `host:{user}:{host}:cmdq` — durable list (`RPUSH`, TTL 2h) of commands (spawn,
  set_model, …) for that machine's `live daemon`. It is the source of truth: the
  daemon drains it (`LPOP`) on connect and on every wakeup nudge, so a command
  issued while the daemon is mid-reconnect is delivered, not lost.
- `host:{user}:{host}:cmd` — pub/sub channel; a message is only a wakeup nudge
  telling the daemon stream to drain `:cmdq`.
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
- **Images (optional).** `images` is an array (≤3) of base64 image data URLs
  (`data:image/png;base64,…`); the server validates mime (png/jpeg/gif/webp) and a
  2 MB decoded cap per image, rejecting a bad one with `400`. The image bytes are
  delivered to the agent **out-of-band**: one `attach_image` frame per image on the
  session's agent stream, published **before** the `viewer_comment`, so the sidecar
  has them buffered when it delivers the comment (whose text already carries the
  client's `[Image #N]` placeholders). The base64 is **never** written to the event
  payload or the `:pending` queue — it is not stored, not broadcast, and never shown
  to viewers. Image delivery therefore requires the agent SSE stream (headless path);
  there is no polling fallback for images.
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

## Relay-only mode (`LS_RELAY_ONLY`)

A deployment-wide switch that turns the server into a **live relay that stores
nothing by default** — the owner's `live` daemon holds the authoritative local
copy; the server persists a session's transcript only when the owner **publishes**
it. Rationale and background: `docs/LOCAL-FIRST-RELAY.md`.

**Binding invariant: with `LS_RELAY_ONLY=false` (the default) behavior is
byte-identical to today.** All relay-only logic is behind this flag, so flipping
it off is a complete rollback. No schema change: "is this session persisted" is
derived from the existing `published_at` column.

When `LS_RELAY_ONLY=true`:
- **`POST …/events` (`emit`)** — always allocates seq, pushes to the Redis replay
  buffer, and publishes to subscribers (so live viewers and late joiners work
  exactly as now). It writes to `session_events` (and meters the owner's storage
  quota) **only if the session is published** (`published_at IS NOT NULL`). For an
  unpublished session it builds the `Event` in memory (server-generated `id`, the
  Redis `seq`, `ts=now()`) — same JSON shape and `201` response as today — and
  skips Postgres entirely. The storage-quota crossing branch cannot fire for an
  unpublished session (nothing is metered).
- **`POST …/publish`** — in addition to its current work (sets `published_at`,
  `visibility='public'`, `hero`, `search_vector`), **backfills the live Redis
  buffer into `session_events`**, preserving each event's existing `id` and `seq`,
  and meters those bytes onto the owner's storage quota. After publish, `emit`
  persists normally. Publishing is therefore only fully lossless **while the
  session is live** (buffer present) or already persisted; publishing an
  already-ended, never-persisted session has no server-side events to recover
  (the daemon's local store is the only copy — daemon replay is a later phase).
- **`POST …/stop`** — archives `sessions/{id}/raw.json` and persists the buffer to
  `session_events` **only if the session is published**; for an unpublished
  session it just deletes the buffer/seq (nothing is kept server-side). Everything
  else (status=ended, ended_at, `session_ended` control frame) is unchanged.
- **Storage quota** accrues only for published sessions; unpublished sessions cost
  zero. Concurrency quota is unchanged.
- **`persisted`** on the session JSON reflects this (see Session shape above).

The `live` daemon keeps an append-only local SQLite archive of every event it
emits (`~/.liveshortly/archive.db` or equivalent), independent of the flag — the
owner's private durable copy. Reading it back / replaying to the server to publish
an already-ended session is a later phase, not v1.

## Env vars (api)
`PORT` (8000), `DATABASE_URL`, `REDIS_URL`, `STORAGE_PATH` (/app/data/sessions),
`CORS_ORIGINS` (*), `DEFAULT_USER_HANDLE` (you),
`DEFAULT_STORAGE_LIMIT_BYTES` (`104857600` = 100 MB) and `DEFAULT_MAX_LIVE_SESSIONS`
(`10`) — per-user quota defaults (per-user overrides live in the DB),
`LIVE_AGENT_GRACE` (`10m`) — how long a Live-shim session whose agent stream has
gone away may stay idle before the abandoned-agent reaper ends it (Go duration).
`LS_RELAY_ONLY` (`false`) — relay-only mode (see **Relay-only mode**); default
`false` is byte-identical to pre-flag behavior.

## Web design
Tokens, type and rules: `web/DESIGN.md` (source of truth: the PocketAI Mac
palette, mirrored in `web/app/tokens.css`). The earlier terminal-HUD spec that
lived here is retired.

Web env: browser uses `NEXT_PUBLIC_API_URL`; server components use `API_INTERNAL_URL`
(falls back to public). Provide a `lib/api.ts` that picks the base by `typeof window`.

## Capture (Claude Code hooks)
Python hooks (stdlib only) under `cli/hooks/` read the hook JSON from stdin and call
the API. They map a Claude `session_id` → a LiveShortly session id stored under a
state dir. Hooks: SessionStart (POST /api/sessions, save mapping), UserPromptSubmit
(emit `prompt`), PreToolUse (emit `tool_call`), PostToolUse (emit `output`/`file_write`),
SessionEnd (POST stop). Config via `LIVESHORTLY_API_URL`. Ship a `.claude/settings.json`
hooks snippet and install docs.
