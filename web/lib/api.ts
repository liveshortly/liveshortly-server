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
  events: SessionEvent[];
}

/** Base URL — internal on the server, public in the browser. */
export function apiBase(): string {
  if (typeof window === "undefined") {
    return (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000"
    );
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/** Browser-only base — used for EventSource which can't read server env. */
export function browserBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    signal,
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${path}`);
  }
  return (await res.json()) as T;
}

export function stats(signal?: AbortSignal): Promise<Stats> {
  return getJSON<Stats>("/api/stats", signal);
}

export interface ListParams {
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
    throw new Error(`POST comment failed: ${res.status} ${res.statusText}`);
  }
}

/** Authenticated user, as reported by GET /api/me. */
export interface Me {
  authenticated: boolean;
  email?: string;
  name?: string;
  picture?: string;
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
