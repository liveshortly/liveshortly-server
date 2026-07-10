# LiveShortly — Auth & Sharing Contract (v2)

Binding spec for the Go API, the plugin, and the web app. Adds **persistent
identity**, a **device-flow OAuth login for the CLI** (shared local credential),
**authorization** (own vs shared sessions), and **sharing**.

## Identity model
One persistent `users` row per human. Both web (Google cookie) and CLI (bearer
access token) resolve to the **same** `users.id`. Sessions are owned by that id.
- Web login: Google OAuth → **upsert** users row by `google_sub` → cookie JWT carries `sub=users.id`.
- CLI login: device flow (below) → access+refresh tokens bound to the same users.id.
The old `X-LiveShortly-Handle` ownership is REMOVED (kept only as an optional display label).

## Tokens
- **Access token**: JWT (HS256, SESSION_SECRET). Claims: `sub`=users.id, `email`, `name`, `typ`="access", `exp` ≈ 1h. Sent as `Authorization: Bearer`.
- **Web session**: same JWT shape but `typ`="web", in the `ls_session` HttpOnly cookie (≈7d).
- **Refresh token**: opaque `lsr_<hex>`, stored **sha256-hashed** in `refresh_tokens`; used to mint new access tokens.

## Device-flow OAuth (CLI login) — endpoints at root (nginx routes `/auth/`, `/device`)
1. `POST /auth/device/start` → `{device_code, user_code, verification_uri, verification_uri_complete, interval:5, expires_in:600}`. Server stores `device_code → {user_code, status:"pending", user_id:null}` in Redis (TTL 600).
2. `GET /device?code=USER_CODE` → HTML approval page. If no valid `ls_session` cookie → redirect to `/auth/google/login?next=/device?code=USER_CODE`. If logged in → show "Approve CLI access for &lt;email&gt;" + Approve button.
3. `POST /auth/device/approve` (cookie-authed) `{user_code}` → bind device's `user_id`=current user, status="approved".
4. `POST /auth/device/poll` `{device_code}` → `{status:"pending"}` (200) until approved, then `{access_token, refresh_token, expires_in, token_type:"Bearer", user:{email,name}}` and consume the code.
5. `POST /auth/token` `{grant_type:"refresh_token", refresh_token}` → `{access_token, expires_in}` (validate hash, not revoked; rotate refresh optionally).
6. `POST /auth/logout` (web) clears cookie. `DELETE /auth/tokens/{id}` revokes a refresh token.

## Middleware (replaces the old web/CLI split)
Resolve the principal for every `/api` request:
1. `Authorization: Bearer X` → parse X as access JWT (`typ`=access, valid) → principal.
2. else `ls_session` cookie JWT (`typ`=web) → principal.
3. else **401**.
Principal = `Identity{ID:users.id, Email, Name}`. All `/api` routes require a principal,
**except** `GET /api/sessions/{id}` and `GET /api/sessions/{id}/stream`, which run behind
`OptionalAuthn`: a missing/invalid credential is let through as an anonymous caller instead
of a 401, so `visibility="open"` sessions (below) are watchable with no login at all. The
handler still enforces authorization — an anonymous caller hitting a non-`open` session gets
401 (private/link/public all require signing in first, then 403 if not permitted).

## Authorization
Central `authorize(user, session, action)`:
- **owner** (`session.owner_id == user.id`) → all actions.
- **share grant** in `session_shares` (by `grantee_user_id` OR `grantee_email==user.email`): `viewer`→read; `commenter`→read+comment.
- **link/public** (`session.visibility` in `link`,`public`): read (and comment if `link_role=commenter`) — requires a signed-in principal.
- **open** (`session.visibility`=`open`): read by **anyone, including an anonymous (unauthenticated) caller**. Comment always requires a signed-in principal even on `open` sessions (there is no anonymous commenting).
Endpoints:
- `GET /api/sessions?scope=mine|shared|all` (default `all`): `mine`=owner_id=me; `shared`=I have a grant; `all`=union. Plus existing `status`,`q`,`limit`,`offset`.
- `GET /api/sessions/{id}` → `authorize(read)` else 401 (anonymous) or 403 (signed in, not permitted).
- `GET /api/sessions/{id}/stream` → same authorization as above.
- `POST /api/sessions/{id}/comments` → `authorize(comment)` (owner or commenter; always requires sign-in).
- `POST /api/sessions`, `/events`, `/stop` → must be the **owner** (CLI token = owner).
- `GET /api/sessions/{id}/comments/pending` → owner only (the capture client).
- `GET /api/stats` → counts over my own + shared.

## Sharing (Google-Drive style)
`session_shares(id, session_id, grantee_user_id?, grantee_email?, role, created_by, created_at, UNIQUE(session_id,grantee_email))`.
- `POST /api/sessions/{id}/shares` (owner) `{email, role:"viewer"|"commenter"}` → insert; set `grantee_user_id` if a user with that email exists.
- `GET /api/sessions/{id}/shares` (owner) → list.
- `DELETE /api/sessions/{id}/shares/{shareId}` (owner).
- `PATCH /api/sessions/{id}` (owner) `{visibility?, link_role?}`.
- On **every login** (web upsert + CLI), resolve pending grants: `UPDATE session_shares SET grantee_user_id=me WHERE grantee_email=my_email AND grantee_user_id IS NULL`.

## `/api/me`
`200 {authenticated:true, id, email, name, is_admin}` (cookie or bearer) else
`401 {authenticated:false}`. For a signed-in user it also carries quota usage:
`storage_bytes_used, storage_limit_bytes, live_sessions, max_live_sessions,
quota_exempt` (effective limits, override → config default).

## Schema additions (idempotent)
- `users`: `email TEXT UNIQUE`, `google_sub TEXT UNIQUE`, `name TEXT`, `avatar_url TEXT`.
- `users` (quotas): `storage_bytes_used BIGINT DEFAULT 0`, `storage_limit_bytes BIGINT` (null → default), `max_live_sessions INT` (null → default), `quota_exempt BOOLEAN DEFAULT false`.
- `sessions` (quotas): `bytes_used BIGINT DEFAULT 0`, `ended_reason TEXT`.
- `sessions`: `visibility TEXT NOT NULL DEFAULT 'private'` (`private`|`link`|`public`|`open`), `link_role TEXT NOT NULL DEFAULT 'viewer'`.
- `refresh_tokens(id UUID pk, user_id FK, token_hash TEXT, label TEXT, created_at, last_used_at, revoked_at)`.
- `session_shares(...)` as above.

## CLI shared credential store
File: `~/.liveshortly/credentials.json` (mode 0600):
```json
{ "api_url":"https://server.liveshortly.com", "access_token":"...", "refresh_token":"lsr_...",
  "expires_at":"RFC3339", "user":{"email":"...","name":"..."} }
```
Plugin behavior:
- `liveshortly login` runs the device flow, opens the browser to `verification_uri_complete`, polls, writes the file.
- Hooks/MCP/channel read the file; if `now >= expires_at-60s`, refresh via `POST /auth/token`, rewrite the file; send `Authorization: Bearer <access_token>`.
- No creds / refresh fails → unauthenticated: SessionStart prints "run: liveshortly login" and skips capture (never blocks Claude).

## Web UI
Home page = two stacked sections: **MY SESSIONS** (`scope=mine`) and **SHARED WITH ME** (`scope=shared`), terminal-HUD styled, live rows badged. Owned sessions get a **SHARE** action (email + role). Shared rows show a `🔗 shared · <role>` badge. Auth gate already exists.
