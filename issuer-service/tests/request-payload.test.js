import { test } from 'node:test';
import assert from 'node:assert';

import {
  ACADEMIC_RECORD_NAMESPACE,
  QUALIFICATION_NAMESPACE,
  TRANSCRIPT_NAMESPACE,
  buildPayload,
  parseCsv,
} from '../src/request-payload.js';

/**
 * The institution's file, as a spreadsheet would export it: the modules are a JSON string, so the
 * cell is quoted and its own quotes are doubled.
 */
const HEADER = [
  'email',
  'full_name',
  'student_id',
  'credential',
  'programme_title',
  'degree_level',
  'field_of_study',
  'graduation_date',
  'institution_name',
  'total_credits',
  'courses',
].join(',');

const COURSES = [
  {
    courseCode: 'CS101',
    courseName: 'Introduction to Programming',
    credits: 3,
    grade: 'A',
    gradePoints: 4,
    term: 'Fall 2023',
    termStart: '2023-08-28',
    termEnd: '2023-12-15',
  },
  {
    courseCode: 'CS202',
    courseName: 'Data Structures',
    credits: 4,
    grade: 'B+',
    gradePoints: 3.3,
    term: 'Spring 2024',
    termStart: '2024-01-16',
    termEnd: '2024-05-10',
  },
];

function cell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function row(overrides = {}) {
  const values = {
    email: 'holder@example.com',
    fullName: 'Ada Lovelace',
    studentId: 'SA-1001',
    credential: 'both',
    programmeTitle: 'BSc Computer Science',
    degreeLevel: 'Bachelor',
    fieldOfStudy: 'Computer Science',
    graduationDate: '2024-06-30',
    institutionName: 'Smart Academy',
    totalCredits: '7',
    courses: COURSES,
    ...overrides,
  };
  return [
    values.email,
    values.fullName,
    values.studentId,
    values.credential,
    values.programmeTitle,
    values.degreeLevel,
    values.fieldOfStudy,
    values.graduationDate,
    values.institutionName,
    values.totalCredits,
    cell(JSON.stringify(values.courses)),
  ].join(',');
}

function file(...rows) {
  return [HEADER, ...rows].join('\n');
}

test('a quoted cell keeps its commas, so a module list cannot slide into another column', () => {
  const { header, rows } = parseCsv('a,b\r\n1,"x,y"\r\n2,"say ""hi"""');
  assert.deepStrictEqual(header, ['a', 'b']);
  assert.deepStrictEqual(rows[0].cells, ['1', 'x,y']);
  assert.deepStrictEqual(rows[1].cells, ['2', 'say "hi"']);
});

test('a spreadsheet export with a byte-order mark is read, not refused as an unknown column', () => {
  const { header } = parseCsv('\uFEFFemail,credential\r\na@b.com,both');
  assert.deepStrictEqual(header, ['email', 'credential']);
});

test('a completed programme produces one credential holding both academic namespaces', () => {
  const result = buildPayload({ csv: file(row()), expectedEmail: 'holder@example.com' });
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.strictEqual(result.rowCount, 1);

  const [credential] = result.credentials;
  assert.strictEqual(credential.kind, 'academic');
  // The transcript kind carries its US-practice supplement, so a combined credential holds three.
  assert.deepStrictEqual(credential.namespaces, [
    QUALIFICATION_NAMESPACE,
    TRANSCRIPT_NAMESPACE,
    ACADEMIC_RECORD_NAMESPACE,
  ]);
  assert.strictEqual(credential.claims.education_qualification.graduation_date, '2024-06-30');
  assert.strictEqual(credential.claims.education_transcript.total_credits, 7);
  assert.strictEqual(credential.claims.education_transcript.courses[0].courseCode, 'CS101');
  assert.strictEqual(credential.display.courseCount, 2);
});

test('a transcript-only row carries no qualification block, so the kind reads off the document', () => {
  const result = buildPayload({
    csv: file(row({ credential: 'transcript', graduationDate: '2024-06-30', degreeLevel: 'Bachelor' })),
  });
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.strictEqual(result.credentials[0].kind, 'transcript');
  assert.strictEqual(result.credentials[0].namespaces.includes(QUALIFICATION_NAMESPACE), false);
  assert.strictEqual('education_qualification' in result.credentials[0].claims, false);
  // A transcript may be issued without a graduation date: it describes a study, not an award.
  const noAward = buildPayload({
    csv: file(row({ credential: 'transcript', graduationDate: '2024-06-30' })),
  });
  assert.strictEqual(noAward.ok, true);
});

test('a qualification-only row carries no transcript block', () => {
  const result = buildPayload({ csv: file(row({ credential: 'qualification' })) });
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.strictEqual(result.credentials[0].kind, 'qualification');
  assert.strictEqual('education_transcript' in result.credentials[0].claims, false);
});

test('the address must be the one the request was opened for', () => {
  const result = buildPayload({ csv: file(row({ email: 'somebody.else@example.com' })), expectedEmail: 'holder@example.com' });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /not the address this request was opened for/);
  assert.deepStrictEqual(result.credentials, [], 'nothing is stored when the file is refused');
});

test('a file naming several holders is refused, because a request belongs to one person', () => {
  // Without an expected address, both rows read cleanly and the several-holders rule is what fails.
  const result = buildPayload({
    csv: file(row({ email: 'a@example.com' }), row({ email: 'b@example.com' })),
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /different addresses/);
});

test('one bad row refuses the whole file, and says which line', () => {
  const result = buildPayload({
    csv: file(row(), row({ graduationDate: '30/06/2024' })),
    expectedEmail: 'holder@example.com',
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /line 3: graduation_date/);
  assert.deepStrictEqual(result.credentials, []);
});

test('an empty required cell is an error rather than a blank claim', () => {
  const result = buildPayload({ csv: file(row({ programmeTitle: '' })) });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /programme_title is empty/);
});

test('a module list that is not a list is refused', () => {
  const notJson = buildPayload({ csv: file(row({ courses: 'CS101, CS202' })) });
  assert.strictEqual(notJson.ok, false);
  assert.match(notJson.errors.join(' '), /courses must be a JSON array/);

  const incomplete = buildPayload({ csv: file(row({ courses: [{ courseCode: 'CS101', credits: 3 }] })) });
  assert.strictEqual(incomplete.ok, false);
  assert.match(incomplete.errors.join(' '), /courses\[0\] is missing/);
});

test('a header without the email column is refused before any row is read', () => {
  const result = buildPayload({ csv: `credential,programme_title\nboth,BSc` });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /missing the email column/);
});

test('an empty file and a header-only file are both refused', () => {
  assert.strictEqual(buildPayload({ csv: '' }).ok, false);
  assert.strictEqual(buildPayload({ csv: '' }).errors[0], 'the file is empty');

  const headerOnly = buildPayload({ csv: HEADER });
  assert.strictEqual(headerOnly.ok, false);
  assert.match(headerOnly.errors.join(' '), /no rows/);
});

test('an unknown credential kind is refused rather than guessed', () => {
  const result = buildPayload({ csv: file(row({ credential: 'certificate' })) });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /credential must be one of/);
});
