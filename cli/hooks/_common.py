"""Shared helpers for LiveShortly Claude Code capture hooks.

Standard library only. These helpers are intentionally defensive: a hook must
never raise in a way that disrupts the Claude Code session, so all network and
filesystem failures are swallowed (diagnostics go to stderr only).
"""

import json
import os
import sys
import urllib.request
import urllib.error


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


def save_mapping(claude_id, ls_id):
    """Persist the mapping claude_id -> ls_id. Best effort."""
    try:
        os.makedirs(state_dir(), exist_ok=True)
        with open(_mapping_path(claude_id), "w") as f:
            json.dump({"claude_id": claude_id, "ls_id": ls_id}, f)
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


def post_json(path, body, timeout=3):
    """POST a JSON body to api_base()+path and return the parsed JSON response.

    Returns a dict on success, or None on any failure (never raises).
    """
    url = api_base() + path
    try:
        data = json.dumps(body if body is not None else {}).encode("utf-8")
    except Exception as exc:
        log("post_json encode failed:", exc)
        return None
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
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


def get_json(path, timeout=5):
    """GET api_base()+path and return the parsed JSON response.

    Returns a dict on success, or None on any failure (never raises).
    """
    url = api_base() + path
    req = urllib.request.Request(
        url, method="GET", headers={"Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        log("get_json failed:", url, exc)
        return None


def pending_comments(ls_id, timeout=5):
    """Atomically drain pending viewer comments for a session.

    Returns a list of {username, message, ts} dicts, or [] on any failure.
    """
    if not ls_id:
        return []
    resp = get_json(
        "/api/sessions/" + str(ls_id) + "/comments/pending", timeout=timeout
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


def emit(ls_id, event_type, payload, actor="agent"):
    """Fire-and-forget: POST an event to a LiveShortly session.

    Swallows all errors so a hook can never break the session.
    """
    if not ls_id:
        return None
    body = {"event_type": event_type, "payload": payload if payload is not None else {}}
    if actor is not None:
        body["actor"] = actor
    return post_json("/api/sessions/" + str(ls_id) + "/events", body)
