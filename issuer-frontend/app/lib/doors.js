/**
 * The two doors, and the words for each answer (P0-35).
 *
 * Written as a plain module rather than inside the page so that the wording can be checked
 * without a browser. The wording *is* the feature here: a wrong sentence turns a legitimate
 * graduate away, or accuses them of something.
 *
 * Four things were settled before any of this was written, and they are the rules the copy has to
 * keep to:
 *
 *   1. **There are three answers, and the third one is honest.** *We could not match that address
 *      to a record* is allowed. *Verification failed* is not. A registry that can only say yes or
 *      no says no to a changed name, an old address, or two people who share a birthday.
 *   2. **Nothing redirects on its own.** The applicant chooses. Nothing here moves them.
 *   3. **The window is measured on the institution's data, never on the applicant's word.** The
 *      chooser asks nothing; it only says which door applies.
 *   4. **Both doors are always visible.** Someone who disagrees with the answer can still take the
 *      other one, and it is never described as a failure.
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
export const DOORS = {
  self: {
    key: 'self',
    name: 'Collect them yourself',
    cost: 'Nothing',
    wait: 'Straight away',
    needs: 'The email address Smart Academy holds for you',
    action: 'Collect my credentials',
  },
  checked: {
    key: 'checked',
    name: 'Ask us to check',
    cost: 'A fee, charged when you send the request',
    wait: 'Up to 10 working days',
    needs: 'Proof of who you are, which we take on Quals',
    action: 'Ask us to check',
  },
};

/** The words for each outcome. Every one of them leaves the applicant somewhere to go. */
export const COPY = {
  windowYears: ELIGIBILITY_WINDOW_YEARS,

  intro:
    'Enter the email address Smart Academy holds for you. We will look at our own records and tell you which way to collect your credentials.',

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
