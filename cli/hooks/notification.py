#!/usr/bin/env python3
"""Notification hook: surface "Claude is waiting"/permission prompts to viewers.

Claude Code fires Notification when it needs the developer's attention — a tool
permission prompt or an idle input wait. We emit an `input_requested` event so
the web viewer shows a banner and any commenter can answer; their reply is
queued and injected on the next prompt/tool boundary.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import read_event, load_mapping, emit, log  # noqa: E402


def classify(message):
    low = (message or "").lower()
    if "permission" in low or "approve" in low or "allow" in low:
        return "permission"
    return "input"


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None
    if not ls_id:
        log("notification: no session mapping; skipping")
        return 0

    message = (event.get("message") or "Claude is waiting for your input").strip()
    emit(
        ls_id,
        "input_requested",
        {"message": message[:500], "kind": classify(message)},
        actor="agent",
        claude_id=claude_id,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never break the session
        log("notification error:", exc)
        sys.exit(0)
