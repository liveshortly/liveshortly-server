# Changelog

All notable changes to LiveShortly (API + web + capture hooks) are recorded here.
Dates are when the work landed on `main`.

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
