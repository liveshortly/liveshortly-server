# Local-First Relay Architecture — Design Plan

**Status:** proposal / research
**Date:** 2026-11-15
**Driver:** kill storage cost (get rid of Supabase), keep the server light, improve privacy.

---

## 1. The idea (in one line)

Session data lives on the **owner's own machine** (the box running `live` + the
agent harness). While a session is **live**, viewers watch it **through our
server, which only relays — it stores nothing**. Only when the owner
**publishes** a feed do we persist that one session with us.

This is not novel — it is exactly **VS Code Live Share's** model applied to agent
sessions:

- Host machine = source of truth; guests work *against* the host.
- Cloud service role = **auth + session discovery only**; it does **not store or
  access session content**, and the relay does not persist or inspect traffic.
- P2P first, cloud relay only as NAT/firewall fallback.
- End-to-end encrypted (host holds the private key; it never leaves the host).

Terminal tools (`tmate`, `upterm`) use the same shape: host opens a reverse
tunnel to a thin relay, session lives on the host, relay is just a rendezvous.

So: **local-authoritative + thin relay + opt-in persistence** is a proven
pattern. We are picking an architecture, not inventing risk.

---

## 2. The one distinction that IS the design

"Viewers access the owner's machine over our backend" can mean two very
different things. Pick deliberately.

### Model A — Server relays (data in path, not stored) ✅ RECOMMENDED
Owner streams events to the server; the server **fans out live to viewers and
writes nothing durable**. The owner's daemon keeps the authoritative log on
**local disk (SQLite)**. This is *today's pipeline minus the Postgres writes*.

- Gets essentially all of the cost win.
- Moderate effort; reuses the existing HTTP→SSE path.

### Model B — True P2P (viewers pull from the owner's machine) ❌ NOT RECOMMENDED
Server is pure signaling; the owner's home machine serves N viewers directly.

- NAT traversal, home-uplink fan-out, exposing a home machine.
- P2P mesh falls apart past a handful of viewers → needs a TURN relay fallback
  anyway → which is *our* server carrying the bandwidth.
- Its **only** extra prize over Model A is dodging bandwidth — and for us that
  prize is nearly worthless (see §3).

**Decision: Model A.**

---

## 3. Cost reality — the win is real, for a precise reason

The usual "WebRTC fan-out is expensive" warnings are about **video**.
LiveShortly streams **text events (JSONL)** — kilobytes, not megabytes.

| Axis | Today | Model A | Note |
|---|---|---|---|
| **Storage** (transcripts) | Postgres/Supabase, grows forever | **≈ $0** — nothing persisted unless published | the big win |
| **Bandwidth** (fan-out) | server egress | server egress, but **tiny** (text, not video) | server stays light *even as relay* |
| **DB** | full Postgres | **small** — accounts, "who's live" registry, published sessions, billing | shrinks massively, doesn't vanish |
| **Compute** | DB writes + heavy history queries | SSE fan-out + Redis buffer | lighter |

**Consequence: this kills the entire Supabase ↔ Cloudflare D1 question.** With
unpublished data not persisted, there is almost no DB to migrate. Whatever small
DB remains stays on native Postgres (self-hosted on the existing EC2, or any
managed Postgres) — no D1, no dialect rewrite, no HTTP-query latency problem.

---

## 4. Privacy — half-solved by default, fully-solved only with E2E

Be honest about the claim being made. **"We don't store it" ≠ "we can't read it."**

- **Model A relay (no E2E):** data still transits our server in **plaintext**.
  We *could* read it in flight. Benefit is real but narrower:
  - nothing at rest to breach,
  - simpler retention / GDPR / data-subject requests,
  - far less liability.
- **Live Share-grade privacy** needs **end-to-end encryption** (owner encrypts,
  viewers hold keys, server is blind). This is real crypto work **and it breaks
  server-side features that require plaintext**:
  - `web/lib/transcript.ts` → `shareSafe` redaction,
  - share-card / excerpt generation,
  - any search, moderation, or published-feed processing.

**Decision needed:** which privacy promise are we making?
1. *"We don't keep your sessions"* → Model A, no E2E. Keeps all features. (Default.)
2. *"We cannot read your sessions"* → Model A + E2E. Lose the features above.

Recommend shipping (1) first; treat (2) as a separate, later track.

---

## 5. Hard problems (product decisions, not just code)

1. **Owner offline = session gone.** Unpublished sessions live only on the
   owner's disk; laptop closed → viewers get nothing, and old/cold sessions are
   unreachable. This *matches the stated intent* ("when live is on, then only
   the session is visible"). Make it the explicit promise:
   **live = only while I'm live; want it permanent → publish.**
2. **Late-joiner backlog.** Viewer joins mid-session — where's the scrollback?
   → **Bounded Redis ring-buffer** for the *current* session (evicted on end).
   Lazier than owner-replays-on-join. Big sessions truncate backlog — acceptable.
3. **Publish = the only durable artifact.** Links to unpublished/ended sessions
   die. Clean model, but changes sharing UX. The "publish" button becomes the
   core persistence action.
4. **Forks / continue-session** (just shipped) assume server-side history.
   Forking a local/offline session means pulling history from the owner's
   machine — fragile if the owner is offline. Must be scoped explicitly:
   either fork is only allowed while the base owner is online, or fork requires
   the base to be published.

---

## 6. Current architecture → target

**Today**
```
live daemon ──HTTP──> server ──> Postgres (Supabase) + Redis ──SSE──> viewers
                                   (durable store + fan-out)
```

**Target (Model A)**
```
live daemon ──HTTP──> server ──Redis live buffer──SSE──> viewers
   │  (relay + fan-out, no durable writes for unpublished)
   └─ local SQLite = authoritative session log
                         │
            owner hits "Publish"
                         ▼
          server snapshots that session → small persistent store
```

---

## 7. Implementation plan (Model A, no E2E) — ~2–4 weeks

| # | Work | Where | Effort |
|---|---|---|---|
| 1 | Local authoritative store: SQLite log of events per session; a `replay`/export command | `live` daemon (`internal/…`) | 2–3 d |
| 2 | Server: stop persisting events for **unpublished** sessions | `api/internal/store`, handlers | 1–2 d |
| 3 | Server: bounded **Redis live buffer** per active session (for late joiners), evicted on session end | `api` + Redis | 2–3 d |
| 4 | Keep SSE fan-out as-is (already text, already cheap) | `api` | ~0 |
| 5 | **Publish path:** snapshot session + events → small persistent store (native Postgres) | `api` + small schema | 2–3 d |
| 6 | Read/fork paths: handle "no server history unless published or owner-online"; fix fork/continue against this | `api` handlers, `web/app/session` | 3–5 d |
| 7 | "Who's live now" registry (ephemeral, Redis) + offline UX in web/apps | `api`, `web`, PocketAI | 2–3 d |
| 8 | Retire Supabase; move the small remaining DB to native Postgres (EC2 or managed) | infra, secrets | 1–2 d |

**Not included:** E2E encryption (separate track; budget feature loss in §4).

---

## 8. Decisions needed before build

1. **Privacy tier:** "don't keep" (no E2E, keep features) vs "can't read" (E2E,
   lose redaction/share/search). → recommend "don't keep" first.
2. **Backlog policy:** ring-buffer size / max events a late joiner sees.
3. **Fork/continue rule for local sessions:** owner-online-only, or
   publish-required.
4. **Where the small residual DB lives:** self-hosted Postgres on existing EC2
   (≈ $0) vs managed Postgres. (D1 is ruled out by §3.)
5. **Retention of the owner's local store:** cap size? auto-prune old sessions
   on the daemon?

---

## 9. Prior art / sources

- VS Code Live Share — [features](https://learn.microsoft.com/en-us/visualstudio/liveshare/overview/features),
  [security](https://learn.microsoft.com/visualstudio/liveshare/reference/security),
  [connectivity](https://docs.microsoft.com/en-us/visualstudio/liveshare/reference/connectivity)
- [upterm](https://github.com/owenthereal/upterm), tmate — relay terminal sharing
- WebRTC fan-out / cost (why Model B's bandwidth prize is moot for text):
  [architecture guide](https://www.forasoft.com/blog/article/webrtc-architecture-guide-for-business-2026)
