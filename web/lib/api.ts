// Typed API client for the LiveShortly Go API.
// Shapes mirror CONTRACT.md exactly.

export type SessionStatus = "live" | "ended";

export type EventType =
  | "prompt"
  | "response"
  | "tool_call"
  | "file_write"
  | "output";

export type Actor = "agent" | "tool" | "viewer" | null;

export type ShareRole = "viewer" | "commenter";

/**
 * Link-sharing reach: private (owner+grants), link (anyone signed in with the
 * URL), public (published to the discoverable feed, still requires sign-in),
 * open (anyone with the URL, including unauthenticated visitors — view-only).
 */
export type Visibility = "private" | "link" | "public" | "open";

export interface Session {
  id: string;
  title: string;
  owner_handle: string;
  model: string | null;
  framework: string | null;
  status: SessionStatus;
  tags: string[];
  event_count: number;
  view_count: number;
  created_at: string; // RFC3339
  ended_at: string | null; // RFC3339 | null
  /** Reach of the shareable link. */
  visibility?: Visibility;
  /** Role granted to anyone opening the link (viewer | commenter). */
  link_role?: ShareRole;
  /** Machine principal that captured the session (e.g. user@hostname). */
  client_handle?: string | null;
  /** Git remote URL of the captured working directory, if any. */
  git_remote?: string | null;
  /** Git branch of the captured working directory, if any. */
  git_branch?: string | null;
  /** Cumulative model token usage reported by the capture client. */
  input_tokens?: number;
  output_tokens?: number;
  /** Number of explicit share grants (visible to the owner). */
  share_count?: number;
  /** Present on rows returned for scope=shared: the caller's grant role. */
  shared_role?: ShareRole | null;
  /** Set (RFC3339) when the session is published to the public feed. */
  published_at?: string | null;
  /** Precomputed preview snippet shown on the feed tile. */
  hero?: string | null;
  /** Total number of sessions forked (handed off) from this one. */
  fork_count?: number;
  /** Set when this session is itself a fork: the source session id. */
  forked_from_id?: string | null;
  /** Snapshot seq of the source this session was forked at. */
  forked_from_seq?: number | null;
  /** When this fork was created (RFC3339). */
  forked_at?: string | null;
}

/** Light reference to a fork source, for the lineage badge (detail only). */
export interface ForkRef {
  id: string;
  title: string;
  owner_handle: string;
  seq: number;
}

/** True when the session's link is open to anyone signed in (not just owner/grants). */
export function isPublicLink(s: Pick<Session, "visibility">): boolean {
  return (
    s.visibility === "link" || s.visibility === "public" || s.visibility === "open"
  );
}

/** True when the session's link needs no sign-in at all (anonymous visitors welcome). */
export function isOpenLink(s: Pick<Session, "visibility">): boolean {
  return s.visibility === "open";
}

/** True when the session is published to the discoverable feed. */
export function isPublished(s: Pick<Session, "published_at">): boolean {
  return !!s.published_at;
}

/** A sharing grant on a session (owner view). */
export interface ShareGrant {
  id: string;
  grantee_email: string;
  role: ShareRole;
  grantee_user_id?: string | null;
  created_at?: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  seq: number;
  actor: Actor;
  event_type: string;
  payload: Record<string, unknown>;
  ts: string; // RFC3339
}

export interface Stats {
  total_sessions: number;
  live_now: number;
  ended: number;
  total_events: number;
}

export interface SessionList {
  results: Session[];
  total: number;
}

export interface SessionDetail extends Session {
  /** Viewers watching right now (live only). Aggregate — never identifies anyone.
   *  Updated live by the SSE `watchers` frame. */
  watcher_count?: number;
  /** Whether the calling viewer may post comments back to the session. */
  can_comment?: boolean;
  /** Whether the calling viewer owns this session (can rename / end it). */
  is_owner?: boolean;
  /** Distinct users who have forked (handed off) this session. */
  forker_count?: number;
  /** Source reference when this session is itself a fork. */
  forked_from?: ForkRef | null;
  events: SessionEvent[];
}

/** Prior context for a forked session: the source's events up to the pinned
 *  snapshot seq (a virtual full-history view; nothing is physically copied). */
export interface Lineage {
  /** The source session, or null when this session is not a fork. */
  source: ForkRef | null;
  snapshot_seq: number;
  /** Source events with seq ≤ snapshot_seq; empty when non-fork or restricted. */
  events: SessionEvent[];
  /** True when the caller can't read the source, so its events are withheld. */
  restricted: boolean;
}

/** Base URL — internal on the server, relative (same-origin) in the browser.
 *  Using relative URLs in the browser means auth + API calls stay on whichever
 *  domain the user is on (liveshortly.com or server.liveshortly.com). */
export function apiBase(): string {
  if (typeof window === "undefined") {
    return (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000"
    );
  }
  return "";
}

/** Browser-only base — empty string so all calls are same-origin. */
export function browserBase(): string {
  return "";
}

/** Error that carries the HTTP status, so callers can branch on 403/404 etc. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    signal,
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `API ${res.status} ${res.statusText} on ${path}`);
  }
  return (await res.json()) as T;
}

export function stats(signal?: AbortSignal): Promise<Stats> {
  return getJSON<Stats>("/api/stats", signal);
}

/** Aggregate proof counts for the anonymous landing page. No auth required. */
export interface PublicStats {
  total_sessions: number;
  live_now: number;
  published: number;
  total_views: number;
  creators: number;
}

export function publicStats(signal?: AbortSignal): Promise<PublicStats> {
  return getJSON<PublicStats>("/api/public/stats", signal);
}

/** Application-wide aggregate metrics (super-admins only). Mirrors the Go
 *  store.AdminStats — counts/rollups only, never any user's session content. */
export interface AdminStats {
  total_users: number;
  total_sessions: number;
  live_now: number;
  ended: number;
  published: number;
  publicly_viewable: number;
  total_events: number;
  total_views: number;
  active_owners: number;
  sessions_last_24h: number;
  sessions_last_7d: number;
}

/** Fetch admin stats. Throws ApiError(403) for non-admins. */
export function adminStats(signal?: AbortSignal): Promise<AdminStats> {
  return getJSON<AdminStats>("/api/admin/stats", signal);
}

/** A user row in the admin directory (rollup activity, no session content). */
export interface AdminUser {
  id: string;
  handle: string;
  name: string;
  email: string;
  avatar_url: string;
  created_at: string;
  last_login_at: string | null;
  last_active_at: string | null;
  session_count: number;
  live_count: number;
}

/** A session row in the admin session browser (metadata only). */
export interface AdminSessionRow {
  id: string;
  title: string;
  owner: string;
  status: SessionStatus;
  visibility: Visibility;
  event_count: number;
  view_count: number;
  created_at: string;
  ended_at: string | null;
  published: boolean;
}

/** List all users (super-admin only). Throws ApiError(403) otherwise. */
export function adminUsers(signal?: AbortSignal): Promise<{ results: AdminUser[] }> {
  return getJSON<{ results: AdminUser[] }>("/api/admin/users", signal);
}

/** List sessions across all users, filtered (all | live | ended | public). */
export function adminSessions(
  filter: "all" | "live" | "ended" | "public" = "all",
  signal?: AbortSignal,
): Promise<{ results: AdminSessionRow[] }> {
  return getJSON<{ results: AdminSessionRow[] }>(
    `/api/admin/sessions?filter=${filter}`,
    signal,
  );
}

export interface ListParams {
  scope?: "mine" | "shared" | "all";
  status?: "live" | "ended" | "all";
  q?: string;
  limit?: number;
  offset?: number;
}

export function listSessions(
  params: ListParams = {},
  signal?: AbortSignal,
): Promise<SessionList> {
  const qs = new URLSearchParams();
  if (params.scope) qs.set("scope", params.scope);
  qs.set("status", params.status ?? "all");
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return getJSON<SessionList>(`/api/sessions?${qs.toString()}`, signal);
}

export function getSession(
  id: string,
  signal?: AbortSignal,
): Promise<SessionDetail> {
  return getJSON<SessionDetail>(
    `/api/sessions/${encodeURIComponent(id)}`,
    signal,
  );
}

/** URL for the SSE stream of a session (browser base). */
export function streamUrl(id: string): string {
  return `${browserBase()}/api/sessions/${encodeURIComponent(id)}/stream`;
}

/**
 * Post a viewer comment back to a session. Uses the browser base so it shares
 * the same origin as fetch/EventSource. The created event echoes back over SSE.
 */
export async function postComment(
  id: string,
  message: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/comments`,
    {
      method: "POST",
      signal,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST comment failed: ${res.status} ${res.statusText}`,
    );
  }
}

/** Answer a live permission request (allow/deny). Drives the CLI's PreToolUse
 *  decision while the capture hook is waiting on it. */
export async function postDecision(
  id: string,
  decision: "allow" | "deny" | "always",
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      signal,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST decision failed: ${res.status} ${res.statusText}`,
    );
  }
}

/** List sharing grants on a session (owner only). */
export function listShares(
  id: string,
  signal?: AbortSignal,
): Promise<{ results: ShareGrant[] }> {
  return getJSON<{ results: ShareGrant[] }>(
    `/api/sessions/${encodeURIComponent(id)}/shares`,
    signal,
  );
}

/** Grant access to a session by email (owner only). */
export async function createShare(
  id: string,
  email: string,
  role: ShareRole,
  signal?: AbortSignal,
): Promise<ShareGrant> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/shares`,
    {
      method: "POST",
      signal,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Could not share: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as ShareGrant;
}

/** Revoke a sharing grant (owner only). */
export async function deleteShare(
  id: string,
  shareId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`,
    {
      method: "DELETE",
      signal,
      credentials: "include",
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new ApiError(
      res.status,
      `Could not remove share: ${res.status} ${res.statusText}`,
    );
  }
}

/** Patch a session's link sharing (owner only). PATCH /api/sessions/{id}. */
export async function patchSession(
  id: string,
  body: { visibility?: Visibility; link_role?: ShareRole; title?: string },
  signal?: AbortSignal,
): Promise<Session> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      signal,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Could not update sharing: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as Session;
}

/** Rename a session (owner only). */
export function renameSession(id: string, title: string, signal?: AbortSignal) {
  return patchSession(id, { title }, signal);
}

/** End a live session (owner only). POST /api/sessions/{id}/stop. */
export async function stopSession(
  id: string,
  signal?: AbortSignal,
): Promise<Session> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/stop`,
    { method: "POST", signal, credentials: "include" },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Could not end session: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as Session;
}

/** Permanently delete a session and every trace of it — DB rows, Redis keys and
 *  the blob archive. Owner only, IRREVERSIBLE. Resolves on success (204); a 404
 *  is treated as already-gone. */
export async function deleteSession(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE", signal, credentials: "include" },
  );
  if (!res.ok && res.status !== 404) {
    throw new ApiError(
      res.status,
      `Could not delete session: ${res.status} ${res.statusText}`,
    );
  }
}

/** Open the session's link to anyone signed in (view-only). */
export function enablePublicLink(id: string, signal?: AbortSignal) {
  return patchSession(id, { visibility: "link", link_role: "viewer" }, signal);
}

/** Open the session's link to anyone at all — no sign-in required (view-only). */
export function enableOpenLink(id: string, signal?: AbortSignal) {
  return patchSession(id, { visibility: "open", link_role: "viewer" }, signal);
}

/** Close the link back to owner + explicit grants only. */
export function disablePublicLink(id: string, signal?: AbortSignal) {
  return patchSession(id, { visibility: "private" }, signal);
}

/** Publish a session to the public, discoverable feed (owner only). */
export async function publishSession(
  id: string,
  signal?: AbortSignal,
): Promise<Session> {
  return postAction(`/api/sessions/${encodeURIComponent(id)}/publish`, signal);
}

/** Remove a session from the feed and make it private again (owner only). */
export async function unpublishSession(
  id: string,
  signal?: AbortSignal,
): Promise<Session> {
  return postAction(`/api/sessions/${encodeURIComponent(id)}/unpublish`, signal);
}

/** A minted handoff code + the ready-to-copy `live` command to continue a session. */
export interface Handoff {
  code: string;
  session_id: string;
  snapshot_seq: number;
  expires_at: string;
  command: string;
}

/** Mint a handoff code so anyone with read access can continue this session as
 *  a new session they own. POST /api/sessions/{id}/handoff. */
export async function generateHandoff(
  id: string,
  signal?: AbortSignal,
): Promise<Handoff> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/handoff`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
      credentials: "same-origin",
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Could not create handoff: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<Handoff>;
}

/** Fetch a fork's prior context: the source session's events up to the pinned
 *  snapshot seq. GET /api/sessions/{id}/lineage. A non-fork returns an empty
 *  lineage; no source access returns the ref with `restricted:true`, no events. */
export async function getLineage(
  id: string,
  signal?: AbortSignal,
): Promise<Lineage> {
  const res = await fetch(
    `${browserBase()}/api/sessions/${encodeURIComponent(id)}/lineage`,
    { signal, credentials: "same-origin" },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `Could not load prior context: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<Lineage>;
}

async function postAction(path: string, signal?: AbortSignal): Promise<Session> {
  const res = await fetch(`${browserBase()}${path}`, {
    method: "POST",
    signal,
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${path} failed: ${res.status}`);
  }
  return (await res.json()) as Session;
}

/** A page of the public feed: published sessions + an opaque next-page cursor. */
export interface FeedPage {
  results: Session[];
  next_cursor: string;
}

/** Fetch a page of the public feed. `q` searches; `cursor` pages. */
export function getFeed(
  params: { q?: string; cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<FeedPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit != null) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return getJSON<FeedPage>(`/api/feed${query ? `?${query}` : ""}`, signal);
}

/** Published sessions that are streaming right now. Not paginated. */
export function getLiveFeed(
  limit = 12,
  signal?: AbortSignal,
): Promise<FeedPage> {
  return getJSON<FeedPage>(`/api/feed?status=live&limit=${limit}`, signal);
}

/** Best-effort "I'm typing" presence ping for a live session (fire-and-forget). */
export function postTyping(id: string, signal?: AbortSignal): void {
  void fetch(`${browserBase()}/api/sessions/${encodeURIComponent(id)}/typing`, {
    method: "POST",
    signal,
    credentials: "include",
  }).catch(() => {});
}

/** Absolute, shareable URL for a session's viewer page. */
export function sessionViewUrl(id: string): string {
  const path = `/session/${encodeURIComponent(id)}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

/** Authenticated user, as reported by GET /api/me. */
export interface Me {
  authenticated: boolean;
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
  /** True when the account is on the super-admin allowlist (server-resolved). */
  is_admin?: boolean;
}

/** Check the current session. A 401 is normal (logged out) → not authenticated. */
export async function me(signal?: AbortSignal): Promise<Me> {
  try {
    const res = await fetch(`${apiBase()}/api/me`, {
      signal,
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (res.status === 401) return { authenticated: false };
    if (!res.ok) return { authenticated: false };
    const data = (await res.json()) as Me;
    return data ?? { authenticated: false };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { authenticated: false };
  }
}

/** Clear the session cookie. */
export async function logout(): Promise<void> {
  await fetch(`${browserBase()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

/** Full-page URL that begins the Google OAuth flow. */
export function loginUrl(): string {
  return `${browserBase()}/auth/google/login`;
}
