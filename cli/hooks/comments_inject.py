#!/usr/bin/env python3
"""PreToolUse hook: mid-turn delivery of viewer comments.

Viewer messages injected while Claude is working should still land. On every
PreToolUse this drains pending comments and, if any, injects them via the
PreToolUse additionalContext mechanism.

IMPORTANT: stdout must contain ONLY the hook-result JSON (Claude Code parses
stdout as the hook result). All diagnostics go to stderr.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    load_mapping,
    pending_comments,
    format_comments_context,
    emit_hook_output,
    log,
)


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None

    if not ls_id:
        emit_hook_output("PreToolUse", "")
        return 0

    comments = pending_comments(ls_id, claude_id=claude_id)
    context = format_comments_context(comments)
    emit_hook_output("PreToolUse", context)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("comments_inject error:", exc)
        try:
            emit_hook_output("PreToolUse", "")
        except Exception:
            pass
        sys.exit(0)
