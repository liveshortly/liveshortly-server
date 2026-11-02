# REST & SSE API

The HTTP API behind the web app and the CLI. Use it to build your own client or automate sessions. You need a LiveShortly server and, for most calls, a signed-in user.

## Base URL and authentication

All paths are on your server's origin, for example `https://live.example.com`. Requests authenticate with either:

- a bearer token: `Authorization: Bearer <access token>` (the CLI's token from `~/.liveshortly/credentials.json`), or
- the `ls_session` cookie set by signing in on the web.

`GET /api/me`, `GET /api/feed`, and reading an open session (including its stream) also work without signing in. Everything else needs a signed-in user, and owner-only calls return `403` for anyone else.

## Sessions

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/api/sessions` | Signed in | Create a session (or a fork) |
| `GET` | `/api/sessions?scope=&status=&q=&limit=&offset=` | Signed in | List your and shared sessions |
| `GET` | `/api/sessions/{id}` | Reader | Session plus its events |
| `PATCH` | `/api/sessions/{id}` | Owner | Change title, visibility or link role |
| `POST` | `/api/sessions/{id}/events` | Owner | Append an event |
| `POST` | `/api/sessions/{id}/stop` | Owner | End the session |
| `POST` | `/api/sessions/{id}/publish` | Owner | Make public and list in the feed |
| `POST` | `/api/sessions/{id}/unpublish` | Owner | Remove from the feed and make private |
| `GET` | `/api/sessions/{id}/summary.md` | Reader | Markdown summary of the session |

Create a session:

```bash
curl -X POST https://live.example.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"fix flaky test","tags":["ci"]}'
```

```json
{
  "id": "6f1c2a9e-...",
  "title": "fix flaky test",
  "status": "live",
  "tags": ["ci"],
  "event_count": 0,
  "created_at": "2026-11-02T09:30:00Z",
  "url": "/session/6f1c2a9e-..."
}
```

Append an event:

```bash
curl -X POST https://live.example.com/api/sessions/$ID/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"prompt","actor":"agent","payload":{"text":"run the tests"}}'
```

```json
{
  "id": "b2d4...",
  "session_id": "6f1c2a9e-...",
  "seq": 1,
  "actor": "agent",
  "event_type": "prompt",
  "payload": { "text": "run the tests" },
  "ts": "2026-11-02T09:30:04Z"
}
```

Event types: `prompt`, `response`, `tool_call`, `pre_tool`, `file_write`, `output`, `viewer_comment`, `input_requested`, `viewer_decision`, `stream_end`, `quota_exceeded`. Each payload is capped at 256 KB.

## Comments and decisions

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/api/sessions/{id}/comments` | Commenter | Send a message to a live session: `{"message":"..."}` |
| `GET` | `/api/sessions/{id}/comments/pending` | Owner | Take queued messages (each is returned once) |
| `POST` | `/api/sessions/{id}/decision` | Commenter | Answer a permission prompt: `{"decision":"allow"}` or `"deny"` |
| `POST` | `/api/sessions/{id}/typing` | Signed in | "Is typing" signal |

## Sharing

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/api/sessions/{id}/shares` | Owner | List invited people |
| `POST` | `/api/sessions/{id}/shares` | Owner | Invite: `{"email":"...","role":"viewer"}` or `"commenter"` |
| `DELETE` | `/api/sessions/{id}/shares/{shareId}` | Owner | Remove an invite |

## Forks and handoff

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/api/sessions/{id}/handoff` | Reader | Create a 7-day handoff code: `{"seq"?:int}` |
| `POST` | `/api/sessions` | Signed in | Fork with `forked_from` (a code) or `forked_from_session_id` (+ `forked_from_seq`) |
| `GET` | `/api/sessions/{id}/lineage` | Reader | A fork's prior context |

```json
{
  "code": "ho_...",
  "session_id": "6f1c2a9e-...",
  "snapshot_seq": 42,
  "expires_at": "2026-11-09T09:30:00Z",
  "command": "live claude --handoff ho_..."
}
```

## Feed, account and stats

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/health` | Anyone | `{"ok":true,"ts":"..."}` |
| `GET` | `/api/me` | Anyone | Who you are, plus quota usage when signed in |
| `GET` | `/api/feed?q=&cursor=&limit=` | Anyone | Published sessions |
| `GET` | `/api/stats` | Signed in | Session and event counts |
| `GET` | `/api/hosts` | Signed in | Your machines running `live daemon` |

## Live stream (SSE)

`GET /api/sessions/{id}/stream` returns `text/event-stream`. Each frame is `data: <json>`:

```text
data: {"type":"connected","session_id":"...","status":"live"}
data: { ...event... }          (every earlier event, in seq order)
data: { ...event... }          (then new events as they happen)
data: {"type":"watchers","count":3}
: ping                         (every 15 seconds)
data: {"type":"session_ended","session_id":"..."}
```

Events are sent once each; de-duplicate by `id` if you reconnect.

```bash
curl -N https://live.example.com/api/sessions/$ID/stream \
  -H "Authorization: Bearer $TOKEN"
```

## Limits

- Each user can have 10 live sessions at once (`429` when over) and 100 MB of stored sessions (`413` when over). Server operators can change these.
- The event that goes over the storage limit is stored, then the session ends. The response includes a handoff code so you can continue in a new session.
