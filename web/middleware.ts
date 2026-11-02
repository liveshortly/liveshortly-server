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
export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has("ls_session");
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/") {
    return signedIn && !searchParams.has("auth_error")
      ? NextResponse.redirect(new URL("/sessions", req.url))
      : NextResponse.next();
  }
  return signedIn || !isPrivate(pathname)
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/", req.url));
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
    "/compose/:path*",
  ],
};
