import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/shared/constants";

/**
 * Next 16 renamed Middleware to Proxy. This is an *optimistic* check only: it
 * redirects obviously-signed-out traffic away from app routes so we don't pay to
 * render them. It is not the security boundary — every page and action
 * re-verifies the session against the database via `requireUser()`.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const { pathname, search } = request.nextUrl;

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /**
     * App routes only. `/` is the public landing page (handled in
     * `app/page.tsx`), auth routes, the marketing site, the Apify webhook
     * (which carries its own bearer secret), and static assets are excluded.
     */
    "/leads/:path*",
    "/pipeline/:path*",
    "/intelligence/:path*",
    "/reports/:path*",
    "/admin/:path*",
    "/account/:path*",
  ],
};
