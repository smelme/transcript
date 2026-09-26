import { NextResponse } from 'next/server';
import { askRegistry } from '../../lib/registry';

/**
 * Put the award the institution holds where the holder can collect it.
 *
 * The institution publishes through its own registry — it is the one that holds the record, and
 * the claims are built there from what it actually keeps. Nothing here invents anything, which is
 * what this route replaced: the old path asked the issuer to generate a record, so the graduation
 * year came from a range and the modules from a fixture.
 *
 * The registry answers with an outcome rather than a bare failure, because the page has to say
 * something true and different for each one. Every non-success outcome below still leaves the
 * applicant a way forward.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let email = '';
  let fullName: string | null = null;

  try {
    const body = (await request.json()) as { email?: unknown; fullName?: unknown };
    email = typeof body?.email === 'string' ? body.email.trim() : '';
    fullName = typeof body?.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : null;
  } catch {
    email = '';
  }

  if (!email) {
    return NextResponse.json(
      { success: false, reason: 'no_address_given' },
      { status: 400 }
    );
  }

  const answer = await askRegistry('/v1/registry/publish', { email, fullName });

  if (!answer.reached) {
    return NextResponse.json({ success: false, reason: 'unreachable' }, { status: 503 });
  }

  if (!answer.body?.success) {
    return NextResponse.json(
      {
        success: false,
        reason: typeof answer.body?.reason === 'string' ? answer.body.reason : 'publish_refused',
        missing: Array.isArray(answer.body?.missing) ? answer.body.missing : undefined,
      },
      { status: answer.status === 503 ? 503 : 200 }
    );
  }

  return NextResponse.json({
    success: true,
    claimUrl: typeof answer.body.claimUrl === 'string' ? answer.body.claimUrl : null,
    expiresAt: typeof answer.body.expiresAt === 'string' ? answer.body.expiresAt : null,
    emailSent: Boolean(answer.body.emailSent),
    name: typeof answer.body.name === 'string' ? answer.body.name : null,
    programmeTitle:
      typeof answer.body.programmeTitle === 'string' ? answer.body.programmeTitle : null,
  });
}
