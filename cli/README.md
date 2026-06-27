# LiveShortly — Claude Code capture hooks

Stream a live Claude Code session into the LiveShortly API. These hooks turn an
ordinary Claude Code session into a shareable, live-updating LiveShortly session:
each prompt, tool call, file write, and tool output is emitted to the API as an
event, and a shareable URL is printed when the session starts.

Pure Python 3, **standard library only** (no pip installs). Networking uses
`urllib.request`. Every hook is fire-and-forget: it exits `0` quickly and never
raises in a way that could block or break your Claude Code session. If the API is
unreachable, hooks degrade silently (diagnostics go to stderr only).

## What gets captured

| Claude Code event | Hook script            | LiveShortly event                                                   |
|-------------------|------------------------|---------------------------------------------------------------------|
| SessionStart      | `session_start.py`     | `POST /api/sessions` → creates session, saves mapping, prints URL   |
| UserPromptSubmit  | `user_prompt_submit.py`| event `prompt`  `{ "content": <prompt> }` (actor `agent`)           |
| PreToolUse        | `pre_tool_use.py`      | event `tool_call` `{ "tool", "input" }` (actor `agent`)            |
| PostToolUse       | `post_tool_use.py`     | event `file_write` for Write/Edit/MultiEdit/NotebookEdit, else `output` (actor `tool`) |
| PreToolUse        | `comments_inject.py`   | injects pending viewer comments mid-turn (additionalContext)        |
| SessionEnd        | `session_end.py`       | `POST /api/sessions/{id}/stop`, clears mapping                      |

The mapping from a Claude `session_id` to a LiveShortly session id is stored as a
small JSON file in the state dir, so later hooks in the same session know which
LiveShortly session to emit to.

## Viewer-comment injection (stream → CLI)

Capture is two-way. Besides streaming the session out, the hooks pull messages
typed by web viewers back *into* the live Claude session.

- The web/API side queues viewer messages. `GET /api/sessions/{id}/comments/pending`
  atomically **drains** the queue (each comment is returned exactly once) and
  returns `{ "comments": [ { "username", "message", "ts" }, ... ] }`.
- On **UserPromptSubmit** (`user_prompt_submit.py`) and on every **PreToolUse**
  (`comments_inject.py`), the hook drains pending comments and, if any, returns a
  hook result on stdout using Claude Code's `additionalContext` mechanism so the
  text is injected into Claude's context:

  ```json
  { "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "<formatted comments>" } }
  ```

  The injected string looks like:

  ```
  [liveshortly] Viewer message(s) from the live stream.
  Your reply MUST begin by addressing the viewer directly (e.g. '@<handle>: ...').
    @alice: how about adding tests?
    @bob: nice work
  Then continue with the developer's request below.
  ```

  When there are no pending comments the hook prints `{}` and exits 0.
  UserPromptSubmit delivers comments at the top of a turn; PreToolUse delivers
  comments that arrive mid-turn while Claude is working, so they still land.

> stdout from these two hooks is parsed by Claude Code as the hook result, so it
> contains ONLY this JSON — all diagnostics go to stderr.

## Environment variables

| Var                    | Default                     | Purpose                                          |
|------------------------|-----------------------------|--------------------------------------------------|
| `LIVESHORTLY_API_URL`  | `http://localhost:8000`     | Base URL of the LiveShortly REST API.            |
| `LIVESHORTLY_WEB_URL`  | `http://localhost:3000`     | Base URL of the web app (for the shareable link).|
| `LIVESHORTLY_STATE_DIR`| `~/.liveshortly/sessions`   | Where session-id mappings are stored.            |
| `LIVESHORTLY_HANDLE`   | `user@hostname` (auto)      | Override the principal sent as `X-LiveShortly-Handle`. |

Each API call from the hooks sends `X-LiveShortly-Handle` derived from
`getpass.getuser()@socket.gethostname()` (stored in the session mapping so it
stays stable for the whole Claude session). The API creates a `users` row on
first sight and never updates an existing handle.

## Install

The hooks are wired up through Claude Code's `settings.json` `hooks` object.

1. Make sure the scripts are executable (already done in this repo):
   ```sh
   chmod +x cli/hooks/*.py
   ```
2. Merge `cli/settings.example.json` into one of:
   - **Project**: `.claude/settings.json` (shared with the repo), or
   - **User**: `~/.claude/settings.json` (applies to all your sessions).

   If the target file already has a `"hooks"` object, merge the keys rather than
   overwriting. The snippet uses `$CLAUDE_PROJECT_DIR` so it resolves to this repo
   regardless of your working directory:

   ```json
   {
     "hooks": {
       "SessionStart": [
         { "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/cli/hooks/session_start.py\"" } ] }
       ],
       "UserPromptSubmit": [
         { "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/cli/hooks/user_prompt_submit.py\"" } ] }
       ],
       "PreToolUse": [
         { "matcher": "*", "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/cli/hooks/pre_tool_use.py\"" } ] }
       ],
       "PostToolUse": [
         { "matcher": "*", "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/cli/hooks/post_tool_use.py\"" } ] }
       ],
       "SessionEnd": [
         { "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/cli/hooks/session_end.py\"" } ] }
       ]
     }
   }
   ```

   If you install at the user level (where `$CLAUDE_PROJECT_DIR` may not point at
   this repo), replace `$CLAUDE_PROJECT_DIR/cli` with an absolute path to this
   `cli/` directory.
3. (Optional) point the hooks at a non-local API:
   ```sh
   export LIVESHORTLY_API_URL=https://api.liveshortly.example
   export LIVESHORTLY_WEB_URL=https://liveshortly.example
   ```
4. Start a new Claude Code session. On `SessionStart` you'll see a line on stderr:
   `[liveshortly] LiveShortly session live: http://localhost:3000/session/<id>`

## Manual test recipe (no Claude needed)

You can exercise the same REST API the hooks use, directly with `curl`, to confirm
capture works end to end. Requires the API running (default port 8000).

```sh
API=${LIVESHORTLY_API_URL:-http://localhost:8000}

# 0) health
curl -s "$API/health"

# 1) create a session, capture its id
SID=$(curl -s -X POST "$API/api/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"title":"manual test","model":"claude","framework":"claude-code"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "session id: $SID"

# 2) emit a prompt event
curl -s -X POST "$API/api/sessions/$SID/events" \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"prompt","payload":{"content":"hello"},"actor":"agent"}'

# 3) emit a tool_call event
curl -s -X POST "$API/api/sessions/$SID/events" \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"tool_call","payload":{"tool":"Bash","input":{"command":"ls"}},"actor":"agent"}'

# 4) view the session (events included, view_count++)
curl -s "$API/api/sessions/$SID"

# 5) open in the browser
echo "${LIVESHORTLY_WEB_URL:-http://localhost:3000}/session/$SID"

# 6) viewer posts a comment (the stream → CLI direction)
curl -s -X POST "$API/api/sessions/$SID/comments" \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","message":"how about adding tests?"}'

# 7) drain pending comments — returns the comment ONCE (atomic drain)
curl -s "$API/api/sessions/$SID/comments/pending"
# => {"comments":[{"username":"alice","message":"how about adding tests?","ts":"..."}]}

# 8) drain again — now empty, proving each comment is delivered exactly once
curl -s "$API/api/sessions/$SID/comments/pending"
# => {"comments":[]}

# 9) stop the session
curl -s -X POST "$API/api/sessions/$SID/stop"
```

## Smoke-test the hooks themselves

Each hook tolerates an unreachable API and exits `0`. You can pipe a sample event
into any hook:

```sh
echo '{"session_id":"test-123","cwd":"/tmp/demo","source":"startup"}' | python3 cli/hooks/session_start.py
echo '{"session_id":"test-123","cwd":"/tmp/demo","prompt":"hi"}'       | python3 cli/hooks/user_prompt_submit.py
echo '{"session_id":"test-123","tool_name":"Bash","tool_input":{"command":"ls"}}' | python3 cli/hooks/pre_tool_use.py
echo '{"session_id":"test-123","tool_name":"Write","tool_input":{"file_path":"/tmp/x"},"tool_response":"ok"}' | python3 cli/hooks/post_tool_use.py
echo '{"session_id":"test-123","tool_name":"Bash","tool_input":{"command":"ls"}}' | python3 cli/hooks/comments_inject.py
echo '{"session_id":"test-123"}' | python3 cli/hooks/session_end.py
```

The two injection hooks (`user_prompt_submit.py`, `comments_inject.py`) print
ONLY a JSON object to stdout (`{}` when there is nothing to inject), so you can
pipe their stdout straight into a JSON parser.

All should exit `0`. Diagnostics (including "API unreachable") print to stderr.
```
