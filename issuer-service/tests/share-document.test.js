import { test } from 'node:test';
import assert from 'node:assert';

import { buildShareDocument, canonicalKey, formatClaimDate, parseCourses } from '../src/share-document.js';
import { renderSharePdf } from '../src/pdf.js';

/** A share as a recipient would receive one, with both spellings of the same claims. */
function shareWith(claims, overrides = {}) {
  return {
    shareId: 'd3f1c2aa-6b1e-4f3a-9a11-8f0b7c2d4e55',
    kind: 'qualification',
    kindLabel: 'Academic qualification',
    senderEmail: 'holder@example.com',
    recipientName: 'Registrar',
    message: null,
    categories: ['personal', 'qualification'],
    createdAt: '2026-09-20T09:12:44.102Z',
    expiresAt: '2026-10-20T09:12:44.102Z',
    claims,
    ...overrides,
  };
}

const QUALIFICATION = {
  given_name: 'Selam',
  family_name: 'Melese',
  birth_date: '19980412',
  institution_name: 'Smart Academy',
  degree_level: 'Master',
  field_of_study: 'Data Science',
  graduation_date: '2026-09-01',
  gpa: 3.85,
};

test('both spellings of a claim land in the same section', () => {
  const snake = buildShareDocument(shareWith(QUALIFICATION));
  const camel = buildShareDocument(
    shareWith({
      givenName: 'Selam',
      familyName: 'Melese',
      birthDate: '19980412',
      institutionName: 'Smart Academy',
      degreeLevel: 'Master',
      fieldOfStudy: 'Data Science',
      graduationDate: '2026-09-01',
      gpa: 3.85,
    }),
  );

  const headings = (doc) => doc.sections.map((s) => s.heading);
  const rows = (doc) => doc.sections.flatMap((s) => s.rows.map(([label]) => label));

  assert.deepEqual(headings(camel), headings(snake));
  assert.deepEqual(rows(camel), rows(snake));
  assert.ok(rows(snake).includes('Level'), 'the degree level keeps a readable heading');
});

test('a claim with no heading is kept rather than dropped', () => {
  const doc = buildShareDocument(shareWith({ ...QUALIFICATION, favourite_colour: 'green' }));
  const other = doc.sections.find((s) => s.id === 'other');
  assert.ok(other, 'the unmatched claim has somewhere to go');
  assert.deepEqual(other.rows, [['Favourite colour', 'green']]);
});

test('every disclosed claim appears exactly once', () => {
  const claims = { ...QUALIFICATION, student_id: 'S001', total_credits: 180, extra_field: 'kept' };
  const doc = buildShareDocument(shareWith(claims));
  const labels = doc.sections.flatMap((s) => s.rows.map(([label]) => label));
  assert.equal(new Set(labels).size, labels.length, 'no claim is shown twice');
  assert.equal(labels.length, Object.keys(claims).length, 'and none is left out');
});

test('dates are rendered one way however the credential spelled them', () => {
  assert.equal(formatClaimDate('2026-09-01'), '1 Sep 2026');
  assert.equal(formatClaimDate('20260901'), '1 Sep 2026');
  assert.equal(formatClaimDate('2026-09-01T12:00:00.000Z'), '1 Sep 2026');
  assert.equal(formatClaimDate('not a date'), 'not a date');
});

test('the module table reads a JSON string claim instead of printing it', () => {
  const courses = [
    { courseCode: 'COMPSCI 701', courseName: 'Algorithms', term: '2026 S1', credits: 15, grade: 'A-', gradePoints: 7 },
    { course_code: 'COMPSCI 702', course_name: 'Systems', term: '2026 S2', credits: 15, grade: 'B+' },
  ];
  assert.equal(parseCourses(JSON.stringify(courses)).length, 2);
  assert.equal(parseCourses('[not json').length, 0);

  const doc = buildShareDocument(shareWith({ ...QUALIFICATION, courses: JSON.stringify(courses) }));
  assert.deepEqual(doc.courses.columns, ['Module', 'Title', 'Term', 'Credits', 'Mark']);
  assert.deepEqual(doc.courses.rows[0], ['COMPSCI 701', 'Algorithms', '2026 S1', '15', 'A- (7)']);
  // snake_case is read too, and a missing field is a dash rather than an emptiness.
  assert.deepEqual(doc.courses.rows[1], ['COMPSCI 702', 'Systems', '2026 S2', '15', 'B+']);
});

test('optional module columns appear only when a module carries them', () => {
  const plain = buildShareDocument(
    shareWith({ courses: JSON.stringify([{ courseCode: 'A', courseName: 'One' }]) }),
  );
  assert.deepEqual(plain.courses.columns, ['Module', 'Title', 'Term', 'Credits', 'Mark']);

  const rich = buildShareDocument(
    shareWith({ courses: JSON.stringify([{ courseCode: 'A', courseName: 'One', workloadHours: 150, grouping: 'Compulsory' }]) }),
  );
  assert.deepEqual(rich.courses.columns, ['Module', 'Title', 'Term', 'Credits', 'Mark', 'Workload', 'Required']);
});

test('the document names the programme and the institution, and says what was checked', () => {
  const doc = buildShareDocument(shareWith({ ...QUALIFICATION, programmeTitle: 'Master of Data Science' }), {
    categoryLabels: ['Personal information', 'Qualification information'],
  });
  assert.equal(doc.subtitle, 'Master of Data Science · Smart Academy');
  assert.equal(doc.share.reference, 'd3f1c2aa-6b1e-4f3a-9a11-8f0b7c2d4e55');
  assert.deepEqual(doc.share.disclosedSections, ['Personal information', 'Qualification information']);
  assert.ok(doc.share.checks.length >= 2, 'the recipient is told what was verified');
  assert.equal(doc.share.sharedOn, '20 Sep 2026');
});

test('canonicalKey folds the two spellings together', () => {
  assert.equal(canonicalKey('degreeLevel'), 'degree_level');
  assert.equal(canonicalKey('grade-points'), 'grade_points');
  assert.equal(canonicalKey('GPA'), 'gpa');
});

test('a long transcript becomes several pages, each named and footed', () => {
  const courses = Array.from({ length: 60 }, (_, i) => ({
    courseCode: `COMPSCI ${700 + i}`,
    courseName: `Advanced topic in computer science number ${i + 1}`,
    term: '2026 Semester one',
    credits: 15,
    grade: 'A-',
  }));
  const doc = buildShareDocument(
    shareWith({ ...QUALIFICATION, courses: JSON.stringify(courses) }, { kindLabel: 'Academic transcript' }),
  );
  const pdf = renderSharePdf(doc);
  const text = pdf.toString('latin1');

  const pages = Number(/\/Count (\d+)/.exec(text)[1]);
  assert.ok(pages > 1, `expected more than one page, got ${pages}`);
  assert.ok(text.includes(`Page 1 of ${pages}`), 'the first page is numbered against the total');
  assert.ok(text.includes(`Page ${pages} of ${pages}`), 'and so is the last');
  assert.ok(text.includes('Quals'), 'the masthead is on every page');
  assert.ok(text.includes('Academic transcript'), 'the document is named');
  assert.ok(text.includes('What Quals checked'), 'and says what was checked');
  assert.ok(text.includes(doc.share.reference), 'the footer carries the share reference');
});

test('the PDF escapes text and never leaves the font encoding', () => {
  const doc = buildShareDocument(
    shareWith({ ...QUALIFICATION, note: 'Awarded (with distinction) — 100% coursework', name_zh: '李' }),
  );
  const pdf = renderSharePdf(doc);
  const text = pdf.toString('latin1');

  assert.ok(text.includes('\\(with distinction\\)'), 'parentheses are escaped, so the stream survives');
  assert.equal((text.match(/\?/g) || []).length, 1, 'one character outside WinAnsi becomes one question mark');
  assert.ok(pdf.length > 1000, 'and the file is a real document');
  assert.ok(text.startsWith('%PDF-1.4'), 'with a header');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'and an end');
});
