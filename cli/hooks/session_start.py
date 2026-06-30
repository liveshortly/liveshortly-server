#!/usr/bin/env python3
"""SessionStart hook: create a LiveShortly session and save the mapping."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    post_json,
    save_mapping,
    resolve_handle,
    detect_model,
    web_base,
    log,
)


def main():
    event = read_event()
    claude_id = event.get("session_id")
    cwd = event.get("cwd") or os.getcwd()
    source = event.get("source") or "startup"

    base = os.path.basename(os.path.normpath(cwd)) if cwd else "session"
    if not base or base in (".", "/"):
        base = "session"
    title = "{} ({})".format(base, source)

    body = {
        "title": title,
        "framework": "claude-code",
    }
    # On resume the transcript already names the model; a fresh session has none
    # yet (reported later by post_tool_use.py once the first turn reveals it).
    model = detect_model(event.get("transcript_path"))
    if model:
        body["model"] = model

    handle = resolve_handle(claude_id)
    resp = post_json("/api/sessions", body, claude_id=claude_id)
    if not resp or not resp.get("id"):
        log("session_start: could not create session (API unreachable?)")
        return 0

    ls_id = resp["id"]
    if claude_id:
        save_mapping(claude_id, ls_id, handle=handle)

    url = web_base() + "/session/" + str(ls_id)
    log("LiveShortly session live:", url)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never break the session
        log("session_start error:", exc)
        sys.exit(0)
