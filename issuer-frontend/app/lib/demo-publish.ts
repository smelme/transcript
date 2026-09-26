/**
 * Publishing a demonstration credential (demo only).
 *
 * The real publish is the institution's own act, done by the registry from the record it holds. On
 * this demonstration deployment there is no reachable registry, so an address the demo list holds
 * is published through the issuer's demonstration route instead — the one P0-41 kept, deliberately
 * fenced, for exactly this case.
 *
 * Two things keep this honest:
 *
 *   - It is only ever reached for an address on the demo list. An address that is not listed gets
 *     the registry's own refusal, so the demo cannot quietly issue to the world.
 *   - The claims are **generated**, not the institution's, and the caller says so by returning
 *     `demo: true`. The page therefore does not repeat a graduation year from the demo list, because
 *     the credential that comes back will hold a different one, and a page that disagreed with the
 *     document it just produced would be worse than a page that says nothing about the year.
 */

import { demoStudentFor } from './demo-registry';

const TIMEOUT_MS = 15000;

export type DemoPublish =
  | { ok: true; claimUrl: string | null; expiresAt: string | null; emailSent: boolean }
  | { ok: false; reason: string; error?: string };

/** The issuer's address. Named, not defaulted: a wrong issuer is worse than no demo. */
function issuerBaseUrl() {
  return String(process.env.ISSUER_API_URL || '').trim().replace(/\/+$/, '');
}

export async function publishDemoRecord({
  email,
  fullName,
}: {
  email: string;
  fullName?: string | null;
}): Promise<DemoPublish> {
  const base = issuerBaseUrl();
  if (!base) {
    return {
      ok: false,
      reason: 'demo_not_configured',
      error: 'ISSUER_API_URL is not set on this deployment',
    };
  }

  const student = demoStudentFor(email);

  try {
    const response = await fetch(`${base}/academy/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName: fullName || student?.name || undefined }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; claimUrl?: string; expiresAt?: string; emailSent?: boolean }
      | null;

    if (!response.ok || !body?.success) {
      // The issuer refuses this route unless the deployment has asked for demonstration records,
      // and that refusal is worth passing on rather than dressing up.
      return {
        ok: false,
        reason: 'demo_generator_refused',
        error: body?.error || `the issuer answered ${response.status}`,
      };
    }

    return {
      ok: true,
      claimUrl: typeof body.claimUrl === 'string' ? body.claimUrl : null,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      emailSent: Boolean(body.emailSent),
    };
  } catch (error) {
    return { ok: false, reason: 'unreachable', error: (error as Error).message };
  }
}
