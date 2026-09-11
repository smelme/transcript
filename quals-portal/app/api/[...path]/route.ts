import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy from the portal to the issuer service.
 *
 * The admin key is attached here, on the server, so it is never shipped to the
 * browser. Configure with ISSUER_API_URL and ADMIN_API_KEY.
 */

const ISSUER_API_URL = process.env.ISSUER_API_URL || 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key';

export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
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
        'x-admin-key': ADMIN_KEY,
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
