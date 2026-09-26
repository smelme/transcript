import { NextResponse } from 'next/server';
import { askRegistry } from '../../lib/registry';

/**
 * Whether the institution holds this person, and whether they finished inside the window.
 *
 * The answer has three values, and this route is careful about the fourth thing that can happen:
 * the registry not answering. That is *not* a "no". A registry that is down, misconfigured or
 * unreachable cannot say anything about the applicant, so the honest answer is `unknown`, which
 * sends them down the checked path where a person looks — and never down the path reserved for
 * people we have positively established are outside the window.
 *
 * Getting that wrong is the one mistake here that hurts somebody: a failure dressed as a "no"
 * would look exactly like a decision.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body?.email === 'string' ? body.email.trim() : '';
  } catch {
    email = '';
  }

  if (!email) {
    return NextResponse.json(
      { verdict: 'unknown', reason: 'no_address_given' },
      { status: 400 }
    );
  }

  const answer = await askRegistry('/v1/registry/eligibility', { email });

  if (!answer.reached) {
    // Deliberately `unknown` rather than an error page: the applicant is owed a way forward, and
    // the checked path is open to everyone.
    console.error('[Eligibility] The registry did not answer; answering unknown');
    return NextResponse.json({ verdict: 'unknown', reason: 'registry_unreachable' });
  }

  const verdict = String(answer.body?.verdict || 'unknown');
  if (verdict !== 'yes' && verdict !== 'no') {
    return NextResponse.json({ verdict: 'unknown', reason: 'registry_unrecognised_answer' });
  }

  return NextResponse.json({
    verdict,
    name: typeof answer.body?.name === 'string' ? answer.body.name : null,
    completedYear:
      typeof answer.body?.completedYear === 'number' ? answer.body.completedYear : null,
  });
}
