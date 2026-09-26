/**
 * One way in, one way out, and the words for each answer (P0-35).
 *
 * Written as a plain module rather than inside the page so that the wording can be checked
 * without a browser. The wording *is* the feature here: a wrong sentence turns a legitimate
 * graduate away, or accuses them of something.
 *
 * There is **one way in**: sign in with the address the institution holds, which is the thing
 * everybody already knows how to do. Somebody we cannot serve that way - because they finished
 * longer ago, or because we cannot match them at all - is offered the checked path, exactly the way
 * a sign-in screen offers "forgot your password?": quietly, underneath, and without suggesting they
 * have done anything wrong.
 *
 * The alternative is not hidden, and it is not the punishment for failing. It is a second road that
 * happens to be slower and cost more, and the applicant is told that plainly when they need it.
 *
 * Three rules the copy has to keep to:
 *
 *   1. **There are three answers, and the third one is honest.** *We could not match that address
 *      to a record* is allowed. *Verification failed* is not. A registry that can only say yes or
 *      no says no to a changed name, an old address, or two people who share a birthday.
 *   2. **Nothing redirects on its own.** Signing in is the step, and taking the other road is a
 *      choice. Nothing here moves anybody.
 *   3. **The answer is the institution's, never the applicant's word about themselves.** Somebody
 *      who cannot be served is corrected by the record, not blamed for it.
 */

/**
 * The window, in years.
 *
 * One figure, in one place. The registry measures by its own setting, and this is the number the
 * copy states — if the two ever disagree, one of them is wrong and the applicant is told
 * something untrue.
 */
export const ELIGIBILITY_WINDOW_YEARS = 5;

/** The checked path, where an applicant goes when self-service does not apply to them. */
export const REQUEST_PAGE_URL =
  process.env.NEXT_PUBLIC_REQUEST_SITE_URL || 'https://quals-production.up.railway.app/request';

/**
 * What each door costs and how long it takes, stated before anything is asked of the applicant.
 * Costs and waits are properties of the doors, not of any particular answer, so they are written
 * once and shown on both.
 */
/**
 * The second road, for somebody the sign-in cannot serve.
 *
 * `prompt` is the line under the sign-in form, and it is deliberately shaped like "forgot your
 * password?": a question about circumstances rather than a verdict about the person. Somebody who
 * reads it and recognises themselves takes it; somebody who does not can ignore it and sign in.
 *
 * The figure comes from the constant above so the prompt cannot drift away from the rule the
 * institution measures by.
 */
export const CHECKED_PATH = {
  /** The line under the form, shaped like the familiar way out of a sign-in screen. */
  prompt: `Finished with us more than ${ELIGIBILITY_WINDOW_YEARS} years ago?`,
  action: 'Ask us to check',
  cost: 'A fee, charged when you send the request',
  wait: 'Up to 10 working days',
  needs: 'Proof of who you are, which we take on Quals',
};

/** The words for each outcome. Every one of them leaves the applicant somewhere to go. */
export const COPY = {
  windowYears: ELIGIBILITY_WINDOW_YEARS,

  intro: `Sign in with the email address Smart Academy holds for you. If we hold a record from the last ${ELIGIBILITY_WINDOW_YEARS} years, your credentials are ready to collect, straight away.`,

  yes: (name, year) => ({
    title: 'We hold your record',
    body: year
      ? `We hold a record for ${name || 'you'}, completed in ${year}. You can collect your credentials yourself, and they are ready now.`
      : `We hold a record for ${name || 'you'}. You can collect your credentials yourself, and they are ready now.`,
  }),

  no: (name) => ({
    title: 'You can still ask us',
    body: `We hold a record for ${name || 'you'}, but it finished more than ${ELIGIBILITY_WINDOW_YEARS} years ago, so we cannot issue it from this page. Ask us to check, and a person will look at it for you.`,
  }),

  unknown: () => ({
    title: 'You can still ask us',
    body: 'We could not match that address to a record. Ask us to check, and a person will look for you.',
  }),

  unknownForOtherReasons: () => ({
    title: 'You can still ask us',
    body: 'We could not look that address up just now. Ask us to check, and a person will look for you.',
  }),

  notPublishable: (missing) => ({
    title: 'You can still ask us',
    body: missing && missing.length > 0
      ? `We hold your record, but it is missing ${listOf(missing)}, which we need before we can issue from it. Ask us to check, and a person will look for you.`
      : 'We hold your record, but not everything we need to issue from it just now. Ask us to check, and a person will look for you.',
  }),

  unavailable: () => ({
    title: 'You can still ask us',
    body: 'We could not reach the issuing service just now. Ask us to check, and a person will look for you.',
  }),
};

/** "a, b and c" — for naming what a record is missing without turning it into a code. */
function listOf(items) {
  const values = items.map((item) => String(item));
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * Turn the registry's answer into a door and a sentence.
 *
 * The only verdict that reaches the self-service door is `yes`. Everything else — `no`, `unknown`,
 * a registry that did not answer, an answer nobody recognises — goes to the checked path, which is
 * open to everyone. The distinction between them is in the words, not in the destination.
 */
export function outcomeFor(answer) {
  const verdict = answer?.verdict;
  const reason = answer?.reason;

  if (verdict === 'yes') {
    const wording = COPY.yes(answer.name, answer.completedYear);
    return { door: 'self', ...wording };
  }

  if (verdict === 'no') {
    const wording = COPY.no(answer.name);
    return { door: 'checked', ...wording };
  }

  if (reason === 'no_match') {
    // The applicant's own address was not found, which is a fact about our records and not about
    // them. The sentence says what happened and what to do; it does not characterise them.
    const wording = COPY.unknown();
    return { door: 'checked', ...wording };
  }

  if (reason === 'record_too_thin') {
    const wording = COPY.notPublishable(answer.missing);
    return { door: 'checked', ...wording };
  }

  if (reason === 'not_configured' || reason === 'unreachable') {
    const wording = COPY.unavailable();
    return { door: 'checked', ...wording };
  }

  const wording = COPY.unknownForOtherReasons();
  return { door: 'checked', ...wording };
}

/** Every sentence this module can produce, for the copy check to read. */
export function allCopy() {
  return [
    COPY.intro,
    // The prompt is copy too: it is the line that offers the second road, and the one place the
    // window figure is stated to the applicant.
    CHECKED_PATH.prompt,
    COPY.yes('Ada Lovelace', 2024).title,
    COPY.yes('Ada Lovelace', 2024).body,
    COPY.no('Ada Lovelace').title,
    COPY.no('Ada Lovelace').body,
    COPY.unknown().title,
    COPY.unknown().body,
    COPY.unknownForOtherReasons().title,
    COPY.unknownForOtherReasons().body,
    COPY.notPublishable(['the completion date']).title,
    COPY.notPublishable(['the completion date']).body,
    COPY.unavailable().title,
    COPY.unavailable().body,
  ];
}
