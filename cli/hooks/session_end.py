#!/usr/bin/env python3
"""SessionEnd hook: stop the LiveShortly session and clear the mapping."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    load_mapping,
    clear_mapping,
    post_json,
    log,
)


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None
    if not ls_id:
        log("session_end: no session mapping; nothing to stop")
        return 0

    post_json("/api/sessions/" + str(ls_id) + "/stop", {})
    if claude_id:
        clear_mapping(claude_id)
    log("session_end: stopped session", ls_id)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("session_end error:", exc)
        sys.exit(0)
