import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'quals_session';

/**
 * Gate the portal behind a session. This only checks that a session cookie is
 * present. The actual token is validated by the issuer service on every API
 * call, so an expired or revoked token still fails closed.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(COOKIE)?.value);

  if (pathname === '/login') {
    if (hasSession) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Gate everything except the API routes themselves (the session endpoint has to
  // stay reachable) and static assets. Note the slash: a bare `api` would also
  // exclude the `/api-keys` page, which must be gated like any other page.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
