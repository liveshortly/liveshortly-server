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
 * Relative Location. Behind nginx, req.url carries Next's own listen address
 * (localhost:3000), so an absolute URL built from it sends visitors there.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has("ls_session");
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/") {
    return signedIn && !searchParams.has("auth_error")
      ? redirectTo("/sessions")
      : NextResponse.next();
  }
  return signedIn || !isPrivate(pathname)
    ? NextResponse.next()
    : redirectTo("/");
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
