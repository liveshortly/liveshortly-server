# Changelog

All notable changes to LiveShortly (API + web + capture hooks) are recorded here.
Dates are when the work landed on `main`. The web (`web/package.json`) and API
(`api/internal/version`) ship as one version and are bumped together; the running
server reports it at `GET /health`.

## 2026-07-08 — v4.0.0

The **handoff & fork** major release. Bumps the app to **4.0.0** and consolidates
the handoff/fork work (below) with the following:

- **Prior-context full-history view (virtual, copy-on-write).** A forked session
  now shows its source's entire prior history. `GET /api/sessions/{id}/lineage`
  returns the source events up to the pinned snapshot seq; the web renders them as
  a distinct, collapsible **PRIOR CONTEXT** block above the fork's own feed —
  nothing is physically copied. RBAC is re-checked on **both** the fork and the
  source (never a capability bypass): no source access → events withheld
  (`restricted: true`); deleted source → reference only. Because each session
  numbers its own `seq` from 1, lineage is a separate block, never merged into the
  fork's seq-sorted feed. It's a human/replay surface — the agent is still seeded
  by the compact digest, not by replaying every prior turn.
- **Codex support.** Codex is a first-class capture framework; the viewer shows a
  human-friendly **Framework** label (Claude Code / Codex / Gemini / Terminal).
- **Server version surface.** `GET /health` now returns `version` (single source of
  truth in `api/internal/version`).

## 2026-07-07 — Session handoff / fork

- **Handoff / fork.** Continue any readable session (live or archived, even someone
  else's) as a **new session you own**, with any agent — the original is untouched.
  Mint a 7-day signed handoff code (`POST /api/sessions/{id}/handoff`) or fork by id
  (`POST /api/sessions` with `forked_from` / `forked_from_session_id` [`+ forked_from_seq`]).
  The server returns a deterministic **digest** (no LLM) that seeds the continuing
  agent. Lineage columns (`forked_from_session_id`, `forked_from_seq`, `forked_at`)
  are recorded on the fork and the source's `fork_count` is bumped in one tx.
  Session-detail responses carry `forked_from` (source ref) + `forker_count`.
- **Admin.** Super-admin grant by email allowlist.

## 2026-06-30
- **Publish → Feed.** "Share to all" is replaced by **Publish**: a session becomes
  public and discoverable. New `/feed` page — a searchable, infinite-scroll grid of
  synthesized HUD tiles; `published_at`/`hero`/`search_vector` columns; keyset feed
  pagination + `ts_rank` relevance search; `POST /publish`, `/unpublish`, `GET /api/feed`.
- **Typing indicators.** Ephemeral "viewer is typing" presence over SSE (`POST
  /typing`, not persisted) and a derived "Claude is working" indicator, in a themed
  blinking-caret component.
- **Session layout.** The event log now fills the viewport and scrolls internally, so
  short sessions no longer waste space and the composer stays pinned below.
- **Real model name** in the UI — detected from the session transcript and reported
  via `PATCH /api/sessions/{id}` instead of a hardcoded `"claude"`.
- **7-hour idle timeout** (was 2h) for live sessions and the pending-comment TTL.
- **Input/permission requests surface in the web** (non-blocking) via the capture
  client's `Notification` hook → `input_requested`; the CLI is never stalled on the web.

## 2026-06-29
- Surface input-requested in the web — banner, browser notification, focused composer.
- Mobile-friendly UI; lighten the dark theme to a graphite gray for readability.
- CI deploy: self-heal the SSH host key via `ssh-keyscan` after a server IP change.

## 2026-06-28
- Night mode, brand icon, local clock, fancy session names, rename/end, idle reaper,
  and session visibility.
- Multi-domain auth + nginx for liveshortly.com; relative browser URLs so auth stays
  on the active domain.
- Theme + header polish: slate-gray light theme, theme toggle above the user menu,
  no long-caching of HTML so deploys propagate.

## 2026-06-27
- **Initial LiveShortly**: Go API + SSE, Next.js terminal-HUD web client, and Claude
  Code capture hooks for live session sharing.
- **Auth**: Google sign-in for the web; device-flow CLI login; persistent users,
  authorization, and Drive-style sharing; "share to all" view-only public link.
- Chat-transcript viewer with quoted replies + markdown; owner identification from
  the CLI `user@hostname`.
- Production deploy: compose, SSE-aware nginx, env template, deploy guide, and
  auto-deploy CI on push to `main`.
