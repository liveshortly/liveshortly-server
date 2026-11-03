// Self-check for lib/transcript.ts (session-view fold). Run: node scripts/check-transcript.mjs
import assert from "node:assert/strict";
import * as t from "../lib/transcript.ts";

let seq = 0;
const ev = (event_type, payload = {}, ts = "2026-11-02T10:00:00Z", actor = "agent") => ({
  id: `x${++seq}`, session_id: "s", seq, actor, event_type, payload, ts,
});

const events = [
  ev("prompt", { prompt: "fix it" }),
  ev("tool_call", { tool: "Bash", input: { command: "git push origin main" } }),
  ev("file_write", { tool: "Edit", file: "/repo/a.ts" }),
  ev("response", { content: "done" }),
  ev("response", { content: "and more" }, "2026-11-02T10:01:00Z"),
  ev("stream_end"),
  ev("viewer_comment", { message: "hi", username: "ann" }, "2026-11-03T09:00:00Z", "viewer"),
];
const items = t.foldEvents(events);
assert.deepEqual(items.map((i) => i.kind), ["day", "single", "work", "single", "single", "day", "single"]);
assert.equal(items[2].events.length, 2, "tool_call + file_write fold into one run");
assert.equal(items[4].grouped, true, "same type+author within 300s groups");
assert.equal(items[3].grouped, false);
assert.equal(t.agentBusy(events.slice(0, 3)), true);
assert.equal(t.agentBusy(events.slice(0, 4)), false);
assert.equal(t.activityLabel(events.slice(0, 2)), "running bash");
assert.equal(t.activityLabel(events.slice(0, 3)), "editing a.ts");

const probe = ev("input_requested", { kind: "permission", message: "Allow?" });
const withProbe = [...events.slice(0, 2), probe];
assert.equal(t.pendingProbe(withProbe), probe);
assert.equal(t.pendingProbe([...withProbe, ev("output", {})]), null, "later activity supersedes");
assert.equal(t.toolSummary(t.toolCallBefore(withProbe, probe)), "Bash · git push origin main");
assert.equal(t.typingLine(["@b", "@a"]), "@a and @b are typing…");
assert.equal(t.diffLines("a\nb", "c").length, 3);

// Share-card text (LSW-37): no markup, no paths beyond a basename, no tokens.
const leak = '<task-notification><task-id>b1</task-id><output-file>/private/tmp/claude-502/-Users-rohit-x/tasks/b1.output</output-file></task-notification>';
assert.equal(t.shareSafe(leak), null, "XML payloads are skipped");
assert.equal(t.shareSafe('{"tool":"Bash"}'), null, "JSON payloads are skipped");
assert.equal(
  t.shareSafe("Fixed **the bug** in `/Users/rohit/app/web/lib/api.ts` — see https://github.com/a/b/pull/3"),
  "Fixed the bug in api.ts — see github.com",
);
assert.equal(t.shareSafe("Wrote /private/tmp/claude-502/-Users-rohit-proj to disk"), "Wrote … to disk");
assert.equal(t.shareSafe("key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"), "key is [redacted]");
assert.equal(t.shareSafe("ok"), null, "too short to be worth showing");
assert.equal(
  t.cardExcerpt([ev("response", { content: "All tests pass now and the card renders." }), ev("response", { content: leak })]),
  "All tests pass now and the card renders.",
  "newest SAFE response wins",
);
assert.deepEqual(
  t.lastEdit([ev("file_write", { tool: "Write", file: "~/src/web/page.tsx", added: "42", removed: "7" }), ev("response", { content: "x" })]),
  { file: "page.tsx", add: 42, del: 7 },
);
console.log("transcript ok");
