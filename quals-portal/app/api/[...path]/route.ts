import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy from the portal to the issuer service.
 *
 * The signed-in administrator's token is read from the httpOnly session cookie
 * and forwarded as a Bearer token, so it never reaches client-side script and
 * the issuer can attribute every action to an administrator.
 */

const ISSUER_API_URL = process.env.ISSUER_API_URL || 'http://localhost:3000';
const COOKIE = 'quals_session';

export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: 'Administrator sign-in required' }, { status: 401 });
  }

  const { path } = await ctx.params;
  const target = `${ISSUER_API_URL}/${path.join('/')}${req.nextUrl.search}`;

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.text() : undefined;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        accept: 'application/json',
        'content-type': req.headers.get('content-type') || 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body && body.length > 0 ? body : undefined,
      cache: 'no-store',
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: `Cannot reach the issuer service at ${ISSUER_API_URL}` },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
