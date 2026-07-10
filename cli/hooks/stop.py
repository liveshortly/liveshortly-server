#!/usr/bin/env python3
"""Stop hook: capture the assistant's reply for the turn that just finished.

Claude Code fires no "assistant responded" event, so the reply text never
reached LiveShortly before — the feed was only prompts + tool activity. This
hook reads the session transcript (which the runtime appends) from the offset
we last emitted, and posts each new assistant turn as a `response` event. The
byte offset is stored on the session mapping so a turn is emitted exactly once.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    read_event,
    load_mapping,
    emit,
    get_transcript_offset,
    mark_transcript_offset,
    read_new_assistant_texts,
    detect_model,
    report_model,
    mapping_has_model,
    mark_mapping_model,
    log,
)


def main():
    event = read_event()
    claude_id = event.get("session_id")
    ls_id = load_mapping(claude_id) if claude_id else None
    if not ls_id:
        log("stop: no session mapping; skipping")
        return 0

    transcript = event.get("transcript_path")

    # Report the true model once, if a tool turn hasn't already done so.
    if claude_id and not mapping_has_model(claude_id):
        model = detect_model(transcript)
        if model and report_model(ls_id, model, claude_id=claude_id) is not None:
            mark_mapping_model(claude_id, model)

    # Emit every assistant turn appended since we last looked.
    offset = get_transcript_offset(claude_id)
    texts, new_offset = read_new_assistant_texts(transcript, offset)
    for text in texts:
        # Full text — the server belt-caps at 256 KB before store and the web
        # truncates for display, so capture stays lossless.
        emit(ls_id, "response", {"content": text}, actor="agent", claude_id=claude_id)
    if new_offset != offset:
        mark_transcript_offset(claude_id, new_offset)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log("stop error:", exc)
        sys.exit(0)
