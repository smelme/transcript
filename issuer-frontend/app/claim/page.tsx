import { redirect } from 'next/navigation';

/**
 * Issuing moved to Quals, so this page forwards there.
 *
 * It is a redirect rather than a deletion because a link is already in somebody's inbox: an email
 * sent before the move, or a bookmark, must not 404. The address is passed on when the link carried
 * one, and the issuing page signs the holder in with a code either way.
 *
 * The fallback is the one address that must keep working even if the variable is missing, because
 * it is the address in those emails.
 */
const ISSUE_SITE_URL =
  process.env.ISSUE_SITE_URL || process.env.SHARE_SITE_URL || 'https://quals-production.up.railway.app';

export default async function ClaimRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const target = new URL('/issue', ISSUE_SITE_URL);
  for (const key of ['email', 'invitation', 'token']) {
    const value = params[key];
    if (typeof value === 'string' && value) {target.searchParams.set(key, value);}
  }
  redirect(target.toString());
}
