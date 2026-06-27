#!/usr/bin/env python3
"""UserPromptSubmit hook.

Emits a `prompt` event AND injects any pending viewer comments from the live
stream into Claude's context via the UserPromptSubmit additionalContext
mechanism.

IMPORTANT: stdout must contain ONLY the hook-result JSON (Claude Code parses
stdout as the hook result). All diagnostics go to stderr.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    load_mapping,
    emit,
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
        # No mapping: behave as before (no emit, no injection).
        log("user_prompt_submit: no session mapping; skipping")
        emit_hook_output("UserPromptSubmit", "")
        return 0

    # 1) emit the developer's prompt event (fire-and-forget).
    prompt = event.get("prompt", "")
    emit(ls_id, "prompt", {"content": prompt}, actor="agent", claude_id=claude_id)

    # 2) drain and inject any pending viewer comments.
    comments = pending_comments(ls_id, claude_id=claude_id)
    context = format_comments_context(comments)
    emit_hook_output("UserPromptSubmit", context)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("user_prompt_submit error:", exc)
        # Still emit valid (empty) JSON so Claude Code is never confused.
        try:
            emit_hook_output("UserPromptSubmit", "")
        except Exception:
            pass
        sys.exit(0)
