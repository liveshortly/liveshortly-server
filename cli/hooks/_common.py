"""Shared helpers for LiveShortly Claude Code capture hooks.

Standard library only. These helpers are intentionally defensive: a hook must
never raise in a way that disrupts the Claude Code session, so all network and
filesystem failures are swallowed (diagnostics go to stderr only).
"""

import getpass
import json
import os
import socket
import sys
import urllib.request
import urllib.error

HANDLE_HEADER = "X-LiveShortly-Handle"


def log(*args):
    """Write a diagnostic line to stderr (never stdout)."""
    try:
        print("[liveshortly]", *args, file=sys.stderr)
    except Exception:
        pass


def read_event():
    """Parse the hook JSON object from stdin.

    Tolerates empty or malformed input by returning an empty dict.
    """
    try:
        data = sys.stdin.read()
    except Exception:
        return {}
    if not data or not data.strip():
        return {}
    try:
        obj = json.loads(data)
        if isinstance(obj, dict):
            return obj
        return {}
    except Exception:
        return {}


def api_base():
    """Base URL of the LiveShortly REST API."""
    return os.environ.get("LIVESHORTLY_API_URL", "http://localhost:8000").rstrip("/")


def web_base():
    """Base URL of the LiveShortly web app (for shareable links)."""
    return os.environ.get("LIVESHORTLY_WEB_URL", "http://localhost:3000").rstrip("/")


def _sanitize_handle(raw):
    """Normalize a handle for the API users.handle column."""
    raw = str(raw).strip().lower()
    out = []
    for ch in raw:
        if ch.isalnum() or ch in "@._-":
            out.append(ch)
        else:
            out.append("_")
    return "".join(out) or "unknown"


def cli_handle():
    """Derive user@hostname from the local machine (the coding principal)."""
    user = getpass.getuser()
    host = socket.gethostname().split(".")[0]
    return _sanitize_handle("{}@{}".format(user, host))


def resolve_handle(claude_id=None):
    """Return the handle for API requests in this Claude session.

    Priority: LIVESHORTLY_HANDLE env override → stored mapping → cli_handle().
    """
    override = os.environ.get("LIVESHORTLY_HANDLE", "").strip()
    if override:
        return _sanitize_handle(override)
    if claude_id:
        try:
            with open(_mapping_path(claude_id)) as f:
                obj = json.load(f)
            h = obj.get("handle")
            if isinstance(h, str) and h.strip():
                return _sanitize_handle(h)
        except Exception:
            pass
    return cli_handle()


def api_headers(claude_id=None):
    """HTTP headers for LiveShortly API calls, including the principal handle."""
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        HANDLE_HEADER: resolve_handle(claude_id),
    }


def state_dir():
    """Directory holding Claude session_id -> LiveShortly session id mappings."""
    d = os.environ.get("LIVESHORTLY_STATE_DIR")
    if not d:
        d = os.path.join(os.path.expanduser("~"), ".liveshortly", "sessions")
    return d


def _safe_name(claude_id):
    """Sanitize a Claude session id into a safe filename."""
    keep = []
    for ch in str(claude_id):
        if ch.isalnum() or ch in ("-", "_"):
            keep.append(ch)
        else:
            keep.append("_")
    return "".join(keep) or "unknown"


def _mapping_path(claude_id):
    return os.path.join(state_dir(), _safe_name(claude_id) + ".json")


def save_mapping(claude_id, ls_id, handle=None):
    """Persist claude_id -> ls_id (+ handle) for later hooks in this session."""
    try:
        os.makedirs(state_dir(), exist_ok=True)
        record = {
            "claude_id": claude_id,
            "ls_id": ls_id,
            "handle": handle if handle else resolve_handle(claude_id),
        }
        with open(_mapping_path(claude_id), "w") as f:
            json.dump(record, f)
        return True
    except Exception as exc:
        log("save_mapping failed:", exc)
        return False


def load_mapping(claude_id):
    """Return the LiveShortly session id for a Claude session id, or None."""
    try:
        with open(_mapping_path(claude_id)) as f:
            obj = json.load(f)
        return obj.get("ls_id")
    except Exception:
        return None


def clear_mapping(claude_id):
    """Remove a stored mapping. Best effort."""
    try:
        os.remove(_mapping_path(claude_id))
    except Exception:
        pass


def mapping_has_model(claude_id):
    """True if this session's model has already been reported (mapping flag)."""
    try:
        with open(_mapping_path(claude_id)) as f:
            return bool(json.load(f).get("model"))
    except Exception:
        return False


def mark_mapping_model(claude_id, model):
    """Record that the model was reported, so we don't PATCH again. Best effort."""
    try:
        path = _mapping_path(claude_id)
        with open(path) as f:
            rec = json.load(f)
        rec["model"] = model
        with open(path, "w") as f:
            json.dump(rec, f)
    except Exception:
        pass


def post_json(path, body, timeout=3, claude_id=None):
    """POST a JSON body to api_base()+path and return the parsed JSON response.

    Returns a dict on success, or None on any failure (never raises).
    """
    url = api_base() + path
    try:
        data = json.dumps(body if body is not None else {}).encode("utf-8")
    except Exception as exc:
        log("post_json encode failed:", exc)
        return None
    headers = api_headers(claude_id)
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        log("post_json failed:", url, exc)
        return None


def get_json(path, timeout=5, claude_id=None):
    """GET api_base()+path and return the parsed JSON response.

    Returns a dict on success, or None on any failure (never raises).
    """
    url = api_base() + path
    headers = {"Accept": "application/json", HANDLE_HEADER: resolve_handle(claude_id)}
    req = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        log("get_json failed:", url, exc)
        return None


def pending_comments(ls_id, timeout=5, claude_id=None):
    """Atomically drain pending viewer comments for a session.

    Returns a list of {username, message, ts} dicts, or [] on any failure.
    """
    if not ls_id:
        return []
    resp = get_json(
        "/api/sessions/" + str(ls_id) + "/comments/pending",
        timeout=timeout,
        claude_id=claude_id,
    )
    if not isinstance(resp, dict):
        return []
    comments = resp.get("comments", [])
    return comments if isinstance(comments, list) else []


def format_comments_context(comments):
    """Build the additionalContext string for injecting viewer comments.

    Returns "" if there are no comments.
    """
    if not comments:
        return ""
    lines = [
        "[liveshortly] Viewer message(s) from the live stream.",
        "Your reply MUST begin by addressing the viewer directly "
        "(e.g. '@<handle>: ...').",
    ]
    for c in comments:
        if not isinstance(c, dict):
            continue
        username = c.get("username", "viewer")
        message = c.get("message", "")
        lines.append("  @{}: {}".format(username, message))
    lines.append("Then continue with the developer's request below.")
    return "\n".join(lines)


def emit_hook_output(hook_event_name, additional_context):
    """Write the hook result JSON to STDOUT (and nothing else).

    stdout MUST contain only this JSON because Claude Code parses stdout as the
    hook result. Prints {} when there is no additional context.
    """
    if additional_context:
        out = {
            "hookSpecificOutput": {
                "hookEventName": hook_event_name,
                "additionalContext": additional_context,
            }
        }
    else:
        out = {}
    try:
        sys.stdout.write(json.dumps(out))
    except Exception:
        pass


def emit(ls_id, event_type, payload, actor="agent", claude_id=None):
    """Fire-and-forget: POST an event to a LiveShortly session.

    Swallows all errors so a hook can never break the session.
    """
    if not ls_id:
        return None
    body = {"event_type": event_type, "payload": payload if payload is not None else {}}
    if actor is not None:
        body["actor"] = actor
    return post_json(
        "/api/sessions/" + str(ls_id) + "/events", body, claude_id=claude_id
    )


def patch_json(path, body, timeout=3, claude_id=None):
    """PATCH a JSON body to api_base()+path. Returns dict on success, else None."""
    url = api_base() + path
    try:
        data = json.dumps(body if body is not None else {}).encode("utf-8")
    except Exception as exc:
        log("patch_json encode failed:", exc)
        return None
    req = urllib.request.Request(
        url, data=data, method="PATCH", headers=api_headers(claude_id)
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        return json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:
        log("patch_json failed:", url, exc)
        return None


def detect_model(transcript_path):
    """Best-effort: read the model id from the Claude Code session transcript.

    The transcript is JSONL; each assistant turn carries `message.model`
    (e.g. "claude-opus-4-8"). Scans from the end for the latest. Returns the
    model id or None.
    """
    if not transcript_path or not os.path.exists(transcript_path):
        return None
    try:
        with open(transcript_path) as f:
            lines = f.readlines()
    except OSError:
        return None
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        msg = obj.get("message")
        if isinstance(msg, dict):
            model = msg.get("model")
            if model and model != "<synthetic>":
                return model
    return None


def report_model(ls_id, model, claude_id=None):
    """Set the session's model label via PATCH. Best effort."""
    if not (ls_id and model):
        return None
    return patch_json(
        "/api/sessions/" + str(ls_id), {"model": model}, claude_id=claude_id
    )
