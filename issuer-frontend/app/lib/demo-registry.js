/**
 * The demo registry — a stand-in for the institution's records (P0-35, demo only).
 *
 * The real registry is the academy platform's database, and the sign-in asks it one question. When
 * that database is unreachable — as it is on this demonstration deployment — the sign-in has nothing
 * to ask, so every address answers *"we could not look that up just now"* and nobody can get past
 * the first step. A demo that cannot demonstrate anything is not a demo.
 *
 * So this is a small, deliberately fake registry: a list of addresses and what the institution
 * would hold for each. It exists to make the five-year rule visible and testable, and it obeys the
 * same rule the real one does, using the same window constant:
 *
 *   - a graduation inside the window  -> `yes`  -> collect them yourself
 *   - a graduation before the window   -> `no`   -> the checked path
 *   - an address that is not listed    -> `unknown` -> the checked path
 *
 * **Three things it must never become:**
 *
 *   1. **Not a fallback for a real answer.** The real registry is asked first, and when it answers,
 *      its answer is the answer. This list only fills its silence — which is why it can never turn
 *      a `no` into a `yes`.
 *   2. **Never on by accident.** It is behind `NEXT_PUBLIC_DEMO_REGISTRY`, and off unless somebody
 *      sets it. A list that quietly decided who could collect a real credential would be the worst
 *      kind of bug: nobody would know to look for it.
 *   3. **Not a claim about anybody.** The records here are invented. They are named as demo data
 *      wherever they surface, and the copy that follows a `yes` does not assert a graduation year
 *      from them, because the demo's credential is generated and the two would disagree.
 */

import { ELIGIBILITY_WINDOW_YEARS } from './doors.js';

/** On only when a deployment says so. Read by the sign-in page and by the server routes. */
export const DEMO_REGISTRY_ENABLED = process.env.NEXT_PUBLIC_DEMO_REGISTRY === 'true';

/**
 * The addresses this demo will recognise, and the record it pretends to hold for each.
 *
 * `graduationDate` is the whole point: it is what the five-year rule is measured from. Two entries
 * sit outside the window on purpose, so the checked path can be tried without editing anything.
 */
export const DEMO_STUDENTS = [
  {
    email: 's.melese+63@gmail.com',
    name: 'S Melese',
    studentId: 'DEMO-63',
    programmeTitle: 'BSc Computer Science',
    degreeLevel: 'degree',
    fieldOfStudy: 'Computing',
    graduationDate: '2024-07-01',
  },
  {
    email: 's.melese+66@gmail.com',
    name: 'S Melese',
    studentId: 'DEMO-66',
    programmeTitle: 'BSc Computer Science',
    degreeLevel: 'degree',
    fieldOfStudy: 'Computing',
    graduationDate: '2024-07-01',
  },
  {
    email: 'david@demo.smartcollege.test',
    name: 'David Kim',
    studentId: 'DEMO-DAVID',
    programmeTitle: 'BSc Computer Science',
    degreeLevel: 'degree',
    fieldOfStudy: 'Computing',
    graduationDate: '2024-07-01',
  },
  {
    email: 'bob@demo.smartcollege.test',
    name: 'Bob Smith',
    studentId: 'DEMO-BOB',
    programmeTitle: 'BA Business',
    degreeLevel: 'degree',
    fieldOfStudy: 'Business',
    graduationDate: '2023-09-01',
  },
  {
    // Outside the window, so the checked path can be demonstrated with a real address.
    email: 'alice@demo.smartcollege.test',
    name: 'Alice Johnson',
    studentId: 'DEMO-ALICE',
    programmeTitle: 'BSc Computer Science',
    degreeLevel: 'degree',
    fieldOfStudy: 'Computing',
    graduationDate: '2015-07-01',
  },
  {
    // Outside the window too, and older still.
    email: 'carol@demo.smartcollege.test',
    name: 'Carol Lee',
    studentId: 'DEMO-CAROL',
    programmeTitle: 'BEng Engineering',
    degreeLevel: 'degree',
    fieldOfStudy: 'Engineering',
    graduationDate: '2012-07-01',
  },
];

/** The window, applied the same way the registry applies it. */
export function withinWindow(graduationDate, now = new Date()) {
  const graduated = new Date(`${String(graduationDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(graduated.getTime())) return false;

  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ELIGIBILITY_WINDOW_YEARS);

  return graduated.getTime() >= cutoff.getTime();
}

/** One entry, by address, case-insensitively. */
export function demoStudentFor(email) {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return null;
  return DEMO_STUDENTS.find((student) => student.email.toLowerCase() === address) || null;
}

/**
 * The answer the demo registry gives, in the shape the real one answers with.
 *
 * An address that is not listed is `unknown`, never `no` — the same rule the real registry keeps,
 * and for the same reason: `unknown` sends somebody to a person, and `no` tells them something we
 * have not established.
 */
export function demoEligibilityFor(email, now = new Date()) {
  const student = demoStudentFor(email);

  if (!student) {
    return { verdict: 'unknown', reason: 'demo_not_listed', name: null, completedYear: null };
  }

  const inside = withinWindow(student.graduationDate, now);
  return {
    verdict: inside ? 'yes' : 'no',
    reason: inside ? 'demo_inside_window' : 'demo_outside_window',
    name: student.name,
    completedYear: Number(String(student.graduationDate).slice(0, 4)),
    demo: true,
  };
}

/** What each listed address will do, for the panel the demo page shows. */
export function demoOutcomes(now = new Date()) {
  return DEMO_STUDENTS.map((student) => ({
    email: student.email,
    name: student.name,
    graduationDate: student.graduationDate,
    verdict: withinWindow(student.graduationDate, now) ? 'yes' : 'no',
  }));
}
