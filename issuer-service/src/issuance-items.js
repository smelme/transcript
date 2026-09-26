/**
 * The list a holder is asked to choose from (P0-42).
 *
 * A holder can end up with more than one session for one programme, and the reason is ordinary use:
 * a session becomes `issued` when it is collected, and a document somebody already holds is never
 * superseded — the institution cannot take back what is in their wallet — so publishing again leaves
 * the collected copy and the new one side by side. Both are real, and listing both asks somebody to
 * add a programme they already have.
 *
 * So the list carries one row per programme, and the row is the one the issuer would hand over now.
 * This is about the list, not the record: both sessions stay, both stay resolvable, and an older
 * link still offers what it offered.
 */

/**
 * The programme an item belongs to.
 *
 * The code the institution published it under when there is one, and the title otherwise — the
 * title being what a reader of the screen would use to tell two rows apart. The institution is part
 * of the key so that two organisations using the same code do not collapse into each other.
 */
export function programmeKeyOf(session) {
  const code = session?.display?.programmeCode;
  const title = session?.display?.title;
  const institution = String(session?.institution || '').trim().toLowerCase();
  const subject = String(code || title || session?.sessionId || '').trim().toLowerCase();
  return `${institution}|${subject}`;
}

/**
 * Which of two copies of one programme the holder should be shown. A prepared credential is what
 * the issuer would give them today, so it outranks one already collected; otherwise the newer.
 */
function preferenceOf(session) {
  if (session?.status === 'pending') {return 0;}
  if (session?.status === 'issued') {return 1;}
  return 2;
}

/**
 * One entry per programme, carrying the chosen session plus two things the row needs:
 *
 *   - `inWallet` — whether *this programme* is already in a wallet, which is not the same question
 *     as whether the chosen session is. A holder who has an older copy and is being offered the
 *     current one should be told both things at once.
 *   - `heldSessionId` — the collected copy behind that, so a caller can act on it (P0-43 forgets the
 *     document of every copy of a programme once the holder has one).
 */
export function oneItemPerProgramme(sessions = []) {
  const groups = new Map();
  for (const session of sessions) {
    if (!session || session.status === 'superseded') {continue;}
    const key = programmeKeyOf(session);
    const group = groups.get(key);
    if (group) {group.push(session);} else {groups.set(key, [session]);}
  }

  const items = [];
  for (const group of groups.values()) {
    const chosen = [...group].sort((a, b) => {
      const rank = preferenceOf(a) - preferenceOf(b);
      if (rank !== 0) {return rank;}
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })[0];
    const held = group.find((session) => session.status === 'issued') || null;
    items.push({
      ...chosen,
      inWallet: !!held,
      heldSessionId: held ? held.sessionId : null,
      copies: group.length,
    });
  }
  return items;
}
