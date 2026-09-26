import { NextResponse } from 'next/server';
import { askRegistry } from '../../lib/registry';
import { DEMO_REGISTRY_ENABLED, demoStudentFor } from '../../lib/demo-registry';
import { publishDemoRecord } from '../../lib/demo-publish';

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

  if (answer.reached && answer.body?.success) {
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

  // The registry could not publish. On a demonstration deployment, an address the demo list holds
  // gets a demonstrated credential instead, so the flow can be walked without a database.
  //
  // What this is not: a fallback for a real record. An address that is not on the list gets the
  // registry's own refusal, so the demo can never quietly issue to somebody it was not asked about.
  const demoStudent = demoStudentFor(email);
  if (DEMO_REGISTRY_ENABLED && demoStudent) {
    const demo = await publishDemoRecord({ email, fullName });
    if (demo.ok) {
      return NextResponse.json({
        success: true,
        demo: true,
        claimUrl: demo.claimUrl,
        expiresAt: demo.expiresAt,
        emailSent: demo.emailSent,
        name: demoStudent.name,
        programmeTitle: demoStudent.programmeTitle,
      });
    }
    console.error(
      `[Publish] The demonstration credential could not be prepared: ${demo.reason} ${demo.error || ''}`
    );
  }

  if (!answer.reached) {
    return NextResponse.json({ success: false, reason: 'unreachable' }, { status: 503 });
  }

  return NextResponse.json(
    {
      success: false,
      reason: typeof answer.body?.reason === 'string' ? answer.body.reason : 'publish_refused',
      missing: Array.isArray(answer.body?.missing) ? answer.body.missing : undefined,
    },
    { status: answer.status === 503 ? 503 : 200 }
  );
}
