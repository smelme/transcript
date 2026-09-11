import { NextRequest, NextResponse } from 'next/server';

/**
 * Portal session endpoints. The admin token issued by the issuer service is
 * kept in an httpOnly cookie so it is never readable by client-side script.
 */

const ISSUER_API_URL = process.env.ISSUER_API_URL || 'http://localhost:3000';
const COOKIE = 'quals_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${ISSUER_API_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: body?.email, password: body?.password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: `Cannot reach the issuer service at ${ISSUER_API_URL}` },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    return NextResponse.json(
      { success: false, error: data.error || 'Sign-in failed' },
      { status: 401 },
    );
  }

  const out = NextResponse.json({ success: true, admin: data.admin });
  out.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return out;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const res = await fetch(`${ISSUER_API_URL}/admin/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ success: false }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    await fetch(`${ISSUER_API_URL}/admin/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const out = NextResponse.json({ success: true });
  out.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return out;
}
