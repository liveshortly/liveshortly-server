#!/usr/bin/env python3
"""PreToolUse hook: emit a `tool_call` event.

When a live viewer is watching, it also offers them the permission prompt: it
emits an `input_requested` event and briefly waits for a web allow/deny, then
returns that as the PreToolUse `permissionDecision` on stdout. If nobody answers
in time (or nobody is watching), it defers to Claude Code's normal local prompt.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    load_mapping,
    emit,
    get_decision,
    log,
)

_WAIT_SECONDS = int(os.environ.get("LIVESHORTLY_PERMISSION_WAIT", "30") or "30")
_WEB_PERMS = os.environ.get("LIVESHORTLY_WEB_PERMISSIONS", "1").lower() not in (
    "0", "false", "no", "off",
)
_GATED_TOOLS = ("Edit", "Write", "MultiEdit", "Bash")


def _describe(tool_name, tool_input):
    if not isinstance(tool_input, dict):
        tool_input = {}
    if tool_name == "Bash":
        cmd = str(tool_input.get("command", ""))[:200]
        return "Run command: " + cmd
    path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or tool_input.get("new_path")
        or ""
    )
    verb = "Create" if tool_name == "Write" else "Edit"
    return "{} file: {}".format(verb, path)


def _await_web_permission(ls_id, tool_name, tool_input, claude_id):
    """Return 'allow'|'deny' from a viewer, or None to defer to the local prompt."""
    if not _WEB_PERMS or tool_name not in _GATED_TOOLS:
        return None
    _, watchers = get_decision(ls_id, claude_id=claude_id)
    if watchers < 1:
        return None

    emit(
        ls_id,
        "input_requested",
        {"message": _describe(tool_name, tool_input), "kind": "permission"},
        actor="agent",
        claude_id=claude_id,
    )

    deadline = time.time() + _WAIT_SECONDS
    while time.time() < deadline:
        decision, _ = get_decision(ls_id, claude_id=claude_id)
        if decision in ("allow", "deny"):
            return decision
        time.sleep(1.0)
    return None


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None
    if not ls_id:
        log("pre_tool_use: no session mapping; skipping")
        return 0

    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    emit(ls_id, "tool_call", {"tool": tool_name, "input": tool_input}, actor="agent", claude_id=claude_id)

    decision = _await_web_permission(ls_id, tool_name, tool_input, claude_id)
    if decision in ("allow", "deny"):
        reason = (
            "Approved by a live viewer on LiveShortly"
            if decision == "allow"
            else "Denied by a live viewer on LiveShortly"
        )
        sys.stdout.write(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": decision,
                "permissionDecisionReason": reason,
            }
        }))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("pre_tool_use error:", exc)
        sys.exit(0)
