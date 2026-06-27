#!/usr/bin/env python3
"""PostToolUse hook: emit `file_write` for file-writing tools, else `output`."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import read_event, load_mapping, emit, log  # noqa: E402

FILE_WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
MAX_OUTPUT_CHARS = 2000


def best_effort_file_path(tool_input):
    """Pull a file path out of a tool_input dict using common key names."""
    if not isinstance(tool_input, dict):
        return None
    for key in ("file_path", "filePath", "path", "notebook_path", "file"):
        val = tool_input.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def stringify(value, cap=MAX_OUTPUT_CHARS):
    """Produce a truncated string view of an arbitrary tool_response value."""
    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, default=str)
        except Exception:
            text = str(value)
    if len(text) > cap:
        return text[:cap] + "... [truncated]"
    return text


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None
    if not ls_id:
        log("post_tool_use: no session mapping; skipping")
        return 0

    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    tool_response = event.get("tool_response")

    if tool_name in FILE_WRITE_TOOLS:
        emit(
            ls_id,
            "file_write",
            {"tool": tool_name, "file": best_effort_file_path(tool_input)},
            actor="tool",
            claude_id=claude_id,
        )
    else:
        emit(
            ls_id,
            "output",
            {"tool": tool_name, "content": stringify(tool_response)},
            actor="tool",
            claude_id=claude_id,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("post_tool_use error:", exc)
        sys.exit(0)
