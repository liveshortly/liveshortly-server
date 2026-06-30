#!/usr/bin/env python3
"""PreToolUse hook: emit a `tool_call` event.

Non-blocking — it only records what Claude is about to do; it never waits on the
web, so the CLI's permission prompt is never delayed.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import read_event, load_mapping, emit, log  # noqa: E402


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
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("pre_tool_use error:", exc)
        sys.exit(0)
