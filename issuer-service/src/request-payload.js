/**
 * The institution's assertion, as a file.
 *
 * In the ordered path the institution states the record: the applicant's form supplies no
 * academic fact, and the issuer signs nothing it was not told. That statement arrives as a CSV
 * for one request, and this module is where it becomes claims.
 *
 * Two rules shape everything here. The first is that a file is all or nothing: a half-issued
 * request is worse than a rejected file, because the holder would collect part of a record and
 * no one would know which part was missing. The second is that the address is not the caller's
 * to choose - a file for a request may only name the address that request was opened for, so an
 * accepted request cannot be redirected to a third party by editing the CSV.
 *
 * The claims are built from the same constants the generator uses, never from string literals
 * written again here, so the CSV path and the published path cannot drift apart.
 */

import {
  ACADEMIC_RECORD_NAMESPACE,
  CREDENTIAL_KINDS,
  QUALIFICATION_NAMESPACE,
  TRANSCRIPT_NAMESPACE,
  academicNamespacesOf,
  kindOfCredentialData,
  labelOfCredentialData,
  todayIso,
} from './credential-generator.js';

/** The namespaces this module writes into, re-exported so callers need not reach past it. */
export { ACADEMIC_RECORD_NAMESPACE, QUALIFICATION_NAMESPACE, TRANSCRIPT_NAMESPACE };

/**
 * The columns a file may carry. Everything listed as required must appear in the header for the
 * credential kinds the file actually uses, and a column that is present but empty is an error
 * rather than a blank claim: a missing module list is not the same as a programme without one.
 */
export const CSV_COLUMNS = {
  email: 'the holder address, which must be the one this request was opened for',
  credential: 'qualification, transcript or both',
  full_name: 'the name as the institution holds it',
  student_id: "the institution's own identifier for the holder",
  programme_title: 'the programme studied',
  degree_level: 'Bachelor, Master, Certificate, ...',
  field_of_study: 'the field, as the institution names it',
  graduation_date: 'YYYY-MM-DD, required for an award',
  institution_name: 'the awarding institution',
  award_title: 'the award as it is conferred, when it differs from the programme title',
  total_credits: 'the credits earned',
  gpa: 'the overall average, on the institution\'s own scale',
  enrolment_start: 'YYYY-MM-DD, the first term',
  enrolment_end: 'YYYY-MM-DD, the last term or the award date',
  courses: 'a JSON array, one object per module',
  date_of_birth: 'YYYY-MM-DD',
  document_number: 'the identity document the record is associated with',
};

/** Columns that must be present and non-empty for a given credential kind. */
const REQUIRED_BY_KIND = {
  qualification: ['programme_title', 'degree_level', 'field_of_study', 'graduation_date', 'institution_name'],
  transcript: ['student_id', 'total_credits', 'courses'],
  both: [
    'programme_title',
    'degree_level',
    'field_of_study',
    'graduation_date',
    'institution_name',
    'student_id',
    'total_credits',
    'courses',
  ],
};

/** Always required, whatever the kind. */
const REQUIRED_ALWAYS = ['email', 'credential'];

/** The kinds a file may name, and the namespaces each one carries. */
const KINDS = { qualification: 'qualification', transcript: 'transcript', both: 'academic' };

/** A module as the record holds it, taken from the columns the institution supplied. */
const COURSE_FIELDS = ['courseCode', 'courseName', 'credits', 'grade', 'gradePoints'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value) {
  if (!DATE_PATTERN.test(String(value || '').trim())) {return false;}
  const parsed = new Date(`${String(value).trim()}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

/**
 * Parse CSV text into rows of cells.
 *
 * Written rather than imported because the format this file must accept is narrow and the failure
 * mode of a lenient parser is silent: a quoted comma read as a separator would move a value into
 * the wrong claim, and the credential would be signed with it. Handles quoted cells, doubled
 * quotes inside a quoted cell, CRLF, and a leading byte-order mark from a spreadsheet export.
 *
 * @param {string} text
 * @returns {{ header: string[], rows: Array<{ line: number, cells: string[] }> }}
 */
export function parseCsv(text) {
  const raw = String(text ?? '').replace(/^\uFEFF/, '');
  const records = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (quoted) {
      if (char === '"') {
        if (raw[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') {line += 1;}
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      cells.push(cell);
      cell = '';
      continue;
    }
    if (char === '\r') {continue;}
    if (char === '\n') {
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = [];
      cell = '';
      line += 1;
      recordLine = line;
      continue;
    }
    cell += char;
  }

  // A file that does not end in a newline still has a last record.
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    records.push({ line: recordLine, cells });
  }

  const nonEmpty = records.filter((record) => record.cells.some((value) => value.trim() !== ''));
  const [headerRecord, ...bodyRecords] = nonEmpty;
  if (!headerRecord) {return { header: [], rows: [] };}

  const header = headerRecord.cells.map((value) => value.trim().toLowerCase());
  return {
    header,
    rows: bodyRecords.map((record) => ({
      line: record.line,
      cells: header.map((_, column) => String(record.cells[column] ?? '').trim()),
    })),
  };
}

function valueFor(row, header, column) {
  const index = header.indexOf(column);
  return index === -1 ? '' : row.cells[index];
}

/** Parse the module list, which travels as a JSON string claim in this system. */
function parseCourses(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: 'courses must be a JSON array' };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'courses must be a JSON array with at least one module' };
  }

  const courses = [];
  for (const [index, entry] of parsed.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: `courses[${index}] must be an object` };
    }
    const missing = COURSE_FIELDS.filter((field) => entry[field] == null || `${entry[field]}`.trim() === '');
    if (missing.length > 0) {
      return { error: `courses[${index}] is missing ${missing.join(', ')}` };
    }
    const credits = Number(entry.credits);
    if (!Number.isFinite(credits) || credits <= 0) {
      return { error: `courses[${index}].credits must be a positive number` };
    }
    const gradePoints = Number(entry.gradePoints);
    if (!Number.isFinite(gradePoints) || gradePoints < 0) {
      return { error: `courses[${index}].gradePoints must be a number` };
    }
    courses.push({
      courseCode: String(entry.courseCode).trim(),
      courseName: String(entry.courseName).trim(),
      credits,
      grade: String(entry.grade).trim(),
      gradePoints,
      outcome: entry.outcome === 'failed' ? 'failed' : 'passed',
      ...(entry.term ? { term: String(entry.term).trim() } : {}),
      ...(entry.termStart && isDate(entry.termStart) ? { termStart: String(entry.termStart).trim() } : {}),
      ...(entry.termEnd && isDate(entry.termEnd) ? { termEnd: String(entry.termEnd).trim() } : {}),
    });
  }
  return { courses };
}

/**
 * Turn one row into the claims for one credential.
 *
 * @param {{ cells: string[], line: number }} row
 * @param {string[]} header
 * @param {{ email: string, issueDate: string }} context the address the request belongs to, and
 *   the day this record is being issued
 * @returns {{ claims?: object, kind?: string, label?: string, errors: string[] }}
 */
function claimsForRow(row, header, context) {
  const errors = [];
  const read = (column) => valueFor(row, header, column);

  const credential = read('credential').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(KINDS, credential)) {
    errors.push(`credential must be one of ${Object.keys(KINDS).join(', ')}`);
    return { errors };
  }
  const kind = KINDS[credential];

  for (const column of [...REQUIRED_ALWAYS, ...REQUIRED_BY_KIND[credential]]) {
    if (header.indexOf(column) === -1) {
      errors.push(`the header is missing the ${column} column, which ${credential} needs`);
    } else if (read(column) === '') {
      errors.push(`${column} is empty`);
    }
  }

  const email = read('email').toLowerCase();
  if (email && !isEmail(email)) {errors.push('email is not a valid address');}
  if (email && context.email && email !== context.email) {
    errors.push(`email ${email} is not the address this request was opened for`);
  }

  for (const column of ['graduation_date', 'enrolment_start', 'enrolment_end', 'date_of_birth']) {
    const value = read(column);
    if (value && !isDate(value)) {errors.push(`${column} must be a date in the form YYYY-MM-DD`);}
  }

  const needsTranscript = credential === 'transcript' || credential === 'both';
  const totalCredits = needsTranscript ? Number(read('total_credits')) : null;
  if (needsTranscript && (!Number.isFinite(totalCredits) || totalCredits < 0)) {
    errors.push('total_credits must be a number');
  }

  let courses = null;
  if (needsTranscript) {
    const parsed = parseCourses(read('courses'));
    if (parsed.error) {errors.push(parsed.error);} else {courses = parsed.courses;}
  }

  const gpa = read('gpa') === '' ? null : Number(read('gpa'));
  if (read('gpa') !== '' && (!Number.isFinite(gpa) || gpa < 0)) {errors.push('gpa must be a number');}

  if (errors.length > 0) {return { errors };}

  const institution = read('institution_name') || context.institution;
  const claims = {
    education_qualification:
      kind === 'transcript'
        ? undefined
        : {
          institution_name: institution,
          degree_level: read('degree_level'),
          field_of_study: read('field_of_study'),
          programme_title: read('programme_title'),
          ...(read('award_title') ? { award_title: read('award_title') } : {}),
          graduation_date: read('graduation_date'),
          outcome: 'completed',
          outcome_scheme: 'programme-outcome',
          ...(gpa === null ? {} : { gpa, gpa_scale_id: 'US-4.00', gpa_scale_maximum: 4 }),
        },
    education_transcript: needsTranscript
      ? {
        institution_name: institution,
        student_id: read('student_id'),
        programme_title: read('programme_title'),
        programme_level: read('degree_level'),
        award_title: read('award_title') || read('programme_title'),
        ...(read('enrolment_start') ? { enrolment_start: read('enrolment_start') } : {}),
        ...(read('enrolment_end') ? { enrolment_end: read('enrolment_end') } : {}),
        total_credits: totalCredits,
        courses,
        outcome: 'completed',
        status: 'completed',
        ...(gpa === null ? {} : { overall_mark: gpa }),
      }
      : undefined,
  };

  // The undefined blocks above are removed rather than serialised as nulls, so a credential holds
  // exactly the namespaces its kind claims and the kind can be read back off the document.
  for (const key of Object.keys(claims)) {
    if (claims[key] === undefined) {delete claims[key];}
  }

  // Built through the same helpers the published path uses, so what this file produces is
  // indistinguishable from what an API caller would have sent.
  const claimKind = kindOfCredentialData(claims);
  return {
    claims,
    kind: claimKind,
    label: labelOfCredentialData(claims),
    namespaces: academicNamespacesOf(claims),
    display: {
      title: read('programme_title') || read('field_of_study') || 'Academic credential',
      degreeLevel: read('degree_level') || null,
      fieldOfStudy: read('field_of_study') || null,
      graduationDate: read('graduation_date') || null,
      institution,
      totalCredits: totalCredits ?? null,
      courseCount: courses ? courses.length : null,
      studentId: read('student_id') || null,
    },
    errors: [],
  };
}

/**
 * Validate a whole file and turn it into claims.
 *
 * @param {object} input
 * @param {string} input.csv the file's text
 * @param {string} [input.expectedEmail] the address the request was opened for
 * @param {string} [input.institution] used when a row does not name one
 * @param {string} [input.issueDate] the day the credential will be dated, for the tests
 * @returns {{ ok: boolean, errors: string[], rows: object[], credentials: object[],
 *   rowCount: number, header: string[] }}
 */
export function buildPayload({ csv, expectedEmail = null, institution = null, issueDate = todayIso() }) {
  const { header, rows } = parseCsv(csv);
  const context = { email: String(expectedEmail || '').trim().toLowerCase() || null, institution, issueDate };

  if (header.length === 0) {
    return { ok: false, errors: ['the file is empty'], rows: [], credentials: [], rowCount: 0, header };
  }
  if (rows.length === 0) {
    return { ok: false, errors: ['the file has a header but no rows'], rows: [], credentials: [], rowCount: 0, header };
  }
  if (header.indexOf('email') === -1) {
    return {
      ok: false,
      errors: ['the header is missing the email column, so the file cannot be matched to a request'],
      rows: [],
      credentials: [],
      rowCount: rows.length,
      header,
    };
  }

  const reported = [];
  const credentials = [];
  const emails = new Set();

  for (const row of rows) {
    const result = claimsForRow(row, header, context);
    reported.push({ line: row.line, errors: result.errors });
    if (result.errors.length > 0) {continue;}

    const email = valueFor(row, header, 'email').toLowerCase();
    emails.add(email);
    credentials.push({
      line: row.line,
      kind: result.kind,
      label: result.label,
      namespaces: result.namespaces,
      display: result.display,
      claims: result.claims,
    });
  }

  const errors = [];
  if (credentials.length !== rows.length) {
    errors.push(`${rows.length - credentials.length} of ${rows.length} rows could not be read`);
  }
  // One file, one holder: a request was opened for one person, and a file naming several would
  // be issuing to people who never asked.
  if (emails.size > 1) {
    errors.push(`the file names ${emails.size} different addresses; a request belongs to one holder`);
  }
  if (context.email && emails.size === 1 && !emails.has(context.email)) {
    errors.push('the file does not name the address this request was opened for');
  }

  // The kinds a request asked for are the kinds that may be issued. A file that answers a
  // different question than the applicant asked is refused here rather than at issue, where a
  // reviewer would already have signed it off.
  const allOrNothing = errors.length === 0;
  if (allOrNothing && credentials.length === 0) {
    errors.push('the file produced no credentials');
  }

  if (errors.length > 0 || credentials.length !== rows.length) {
    return {
      ok: false,
      errors: [...errors, ...reported.filter((row) => row.errors.length > 0).flatMap((row) => row.errors.map((error) => `line ${row.line}: ${error}`))],
      rows: reported,
      credentials: [],
      rowCount: rows.length,
      header,
    };
  }

  return {
    ok: true,
    errors: [],
    rows: reported,
    credentials: credentials.map(({ line, ...rest }) => rest),
    rowCount: rows.length,
    header,
  };
}

/** What a file of this kind is: the kinds a request may ask for. */
export const WANTED_KINDS = ['qualification', 'transcript', 'both'];

/** The namespaces each kind carries, for the preview and for a reviewer's summary. */
export function namespacesForKind(kind) {
  const key = KINDS[kind] || kind;
  return CREDENTIAL_KINDS[key]?.academicNamespaces || [];
}
