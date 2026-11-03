import { NextResponse, type NextRequest } from "next/server";
import { isPrivate } from "@/lib/routes";

/**
 * Coarse auth routing on the server, so nothing waits on a blank client render:
 * - `/` sends signed-in visitors to /sessions; everyone else gets the landing.
 * - App routes (lib/routes.ts PRIVATE_PREFIXES) send signed-out visitors to the landing.
 * Only checks the cookie EXISTS (the API still authorizes every request); a
 * stale cookie lands on an app route, where AuthGate falls back to the landing.
 * Every other path is public (or a real 404) and is not touched here.
 */
/**
 * Absolute redirect on the PUBLIC origin. req.url carries Next's own listen
 * address behind the proxy (localhost:3000), and Next rejects a relative
 * Location in middleware, so build the origin from the forwarded host,
 * falling back to the build-time public URL when the proxy didn't send one.
 */
function redirectTo(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const internal = !host || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const origin = internal
    ? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? req.nextUrl.origin
    : `${proto.split(",")[0].trim()}://${host}`;
  return NextResponse.redirect(new URL(path, origin));
}

export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has("ls_session");
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/") {
    return signedIn && !searchParams.has("auth_error")
      ? redirectTo(req, "/sessions")
      : NextResponse.next();
  }
  return signedIn || !isPrivate(pathname)
    ? NextResponse.next()
    : redirectTo(req, "/");
}

// Must stay a literal (Next reads it statically): PRIVATE_PREFIXES from
// lib/routes.ts as patterns, plus "/". The runtime check above is the truth.
export const config = {
  matcher: [
    "/",
    "/sessions/:path*",
    "/new/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
