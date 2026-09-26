import { NextResponse } from 'next/server';
import { askRegistry } from '../../lib/registry';
import { DEMO_REGISTRY_ENABLED, demoEligibilityFor } from '../../lib/demo-registry';

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

  // The real registry answers first, and when it answers, its answer is the answer. Everything
  // below this block only fills its silence, which is why the demo list can never turn a real `no`
  // into a `yes`.
  if (answer.reached) {
    const verdict = String(answer.body?.verdict || '');
    if (verdict === 'yes' || verdict === 'no') {
      return NextResponse.json({
        verdict,
        name: typeof answer.body?.name === 'string' ? answer.body.name : null,
        completedYear:
          typeof answer.body?.completedYear === 'number' ? answer.body.completedYear : null,
      });
    }
  }

  // The demonstration registry, on only when a deployment has asked for it. Without it, a
  // deployment whose database is unreachable cannot demonstrate anything at all.
  if (DEMO_REGISTRY_ENABLED) {
    const demo = demoEligibilityFor(email);
    return NextResponse.json({
      verdict: demo.verdict,
      // An address the demo list does not hold is a record we looked for and did not find, so the
      // applicant reads the sentence for a missing match rather than the one for a failure. Both
      // lead to the checked path; only one of them is true.
      reason: demo.reason === 'demo_not_listed' ? 'no_match' : demo.reason,
      name: demo.name,
      // No year, deliberately: the demonstrated credential is generated and will hold its own, so a
      // page that stated one from this list would disagree with the document it is about to make.
      completedYear: null,
      demo: true,
    });
  }

  if (!answer.reached) {
    // Deliberately `unknown` rather than an error page: the applicant is owed a way forward, and
    // the checked path is open to everyone.
    console.error('[Eligibility] The registry did not answer; answering unknown');
    return NextResponse.json({ verdict: 'unknown', reason: 'registry_unreachable' });
  }

  return NextResponse.json({ verdict: 'unknown', reason: 'registry_unrecognised_answer' });
}
