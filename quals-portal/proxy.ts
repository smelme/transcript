import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'quals_session';

/**
 * Gate the portal behind a session. This only checks that a session cookie is
 * present — the actual token is validated by the issuer service on every API
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
