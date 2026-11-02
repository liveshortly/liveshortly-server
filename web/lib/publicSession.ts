import { cache } from "react";
import { ApiError, getSession, type SessionDetail } from "@/lib/api";

/** Server-side session fetch for public pages (session, replay, story) —
 *  WITHOUT the visitor's cookies: only sessions the API serves anonymously
 *  (visibility "open", already redacted for non-owners) resolve, so a private
 *  session is never rendered into HTML. "missing" = the API says it doesn't
 *  exist (→ real 404); null = needs sign-in or the API failed, which the page's
 *  client half handles with the visitor's cookie. Cached per request so
 *  metadata and page share one API call. `countView` false when the client
 *  refetches anyway (that fetch counts the view). */
export const loadPublicSession = cache(
  async (id: string, countView: boolean): Promise<SessionDetail | "missing" | null> => {
    try {
      return await getSession(id, AbortSignal.timeout(3000), undefined, countView);
    } catch (e) {
      return e instanceof ApiError && e.status === 404 ? "missing" : null;
    }
  },
);
