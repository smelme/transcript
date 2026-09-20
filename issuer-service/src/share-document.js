/**
 * The document a share presents, built once.
 *
 * The same structured document feeds the page a recipient reads and the PDF they download, so the
 * two cannot drift and there is one place that decides what a reader sees. It is also the only
 * place that knows how a credential's claim names map to headings: the claim set arrives from the
 * verifier with camelCase names for a transcript and snake_case names for a qualification, and a
 * reader should not be able to tell which kind they are looking at from the spelling.
 *
 * Everything disclosed is put somewhere. A claim this file has no heading for lands under "Other
 * disclosed details" rather than being dropped, because the recipient is entitled to see exactly
 * what the holder released, and a silently missing field is worse than an odd heading.
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Dates arrive as `YYYY-MM-DD` from our own encoder, as `YYYYMMDD` from the wallet's claim set, or
 * as a Date when a decoder expands CBOR tag 1004. A reader wants one shape for all three.
 */
export function formatClaimDate(value) {
  const text = String(value ?? '');
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  const compact = iso ? null : text.match(/^(\d{4})(\d{2})(\d{2})$/);
  const match = iso || compact;
  if (!match) {return text;}
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) {return text;}
  return `${day} ${MONTH_NAMES[month]} ${match[1]}`;
}

/** `degreeLevel` and `degree_level` are the same claim. Everything is keyed by the snake_case one. */
export function canonicalKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/** A heading for every claim this system issues, in the words a reader would use. */
const LABELS = {
  given_name: 'Given name',
  family_name: 'Family name',
  birth_date: 'Date of birth',
  document_number: 'Document number',
  issuing_authority: 'Issuing authority',
  institution_name: 'Institution',
  institution_id: 'Institution identifier',
  institution_ror: 'Registry identifier',
  degree_level: 'Level',
  field_of_study: 'Field of study',
  programme_title: 'Programme',
  graduation_date: 'Graduation date',
  enrolment_start: 'Started',
  enrolment_end: 'Finished',
  gpa: 'Grade point average',
  gpa_scale_id: 'Grade scale',
  gpa_scale_maximum: 'Scale maximum',
  outcome: 'Outcome',
  completion_status: 'Completion',
  language_of_instruction: 'Language of instruction',
  student_id: 'Student ID',
  transcript_type: 'Document type',
  document_status: 'Document status',
  document_completeness: 'Completeness',
  attesting_office: 'Attested by',
  attesting_capacity: 'Capacity',
  total_credits: 'Total credits',
  status: 'Status',
  courses: 'Modules',
};

/** Which heading each claim belongs under, in the order a reader wants them. */
const SECTION_ORDER = [
  {
    id: 'holder',
    heading: 'Holder',
    keys: [
      'given_name',
      'family_name',
      'birth_date',
      'document_number',
      'student_id',
      'issuing_authority',
    ],
  },
  {
    id: 'qualification',
    heading: 'Qualification',
    keys: [
      'institution_name',
      'institution_id',
      'institution_ror',
      'programme_title',
      'degree_level',
      'field_of_study',
      'graduation_date',
      'enrolment_start',
      'enrolment_end',
      'outcome',
      'completion_status',
      'gpa',
      'gpa_scale_id',
      'gpa_scale_maximum',
      'language_of_instruction',
    ],
  },
  {
    id: 'transcript',
    heading: 'Transcript',
    keys: [
      'transcript_type',
      'document_status',
      'document_completeness',
      'total_credits',
      'status',
      'attesting_office',
      'attesting_capacity',
    ],
  },
];

const OTHER_HEADING = 'Other disclosed details';

export function labelFor(key) {
  return LABELS[canonicalKey(key)] || canonicalKey(key).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * A value as a reader should see it. A nested object is shown as its parts rather than as JSON,
 * which reads as a fault in the document.
 */
export function formatClaimValue(value) {
  if (value === null || value === undefined || value === '') {return '—';}
  if (value instanceof Date) {return formatClaimDate(value.toISOString().slice(0, 10));}
  if (typeof value === 'object') {
    const parts = Object.entries(value).map(([key, item]) => `${labelFor(key)}: ${formatClaimValue(item)}`);
    return parts.length ? parts.join(' · ') : '—';
  }
  return typeof value === 'string' ? formatClaimDate(value) : String(value);
}

/** The course list travels as one JSON string claim. It is read, never printed as JSON. */
export function parseCourses(value) {
  if (Array.isArray(value)) {return value;}
  if (typeof value !== 'string' || value.trim() === '') {return [];}
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Course fields are camelCase in this system's credentials and snake_case in older claims. */
function courseValue(course, field) {
  if (!course || typeof course !== 'object') {return '—';}
  const wanted = canonicalKey(field);
  for (const [key, value] of Object.entries(course)) {
    if (canonicalKey(key) === wanted) {
      return value === null || value === undefined || value === '' ? '—' : String(value);
    }
  }
  return '—';
}

/** The mark a course carries, with its grade points when the credential gives them. */
function courseMark(course) {
  const grade = courseValue(course, 'grade');
  const points = courseValue(course, 'gradePoints');
  if (grade === '—') {return '—';}
  return points === '—' ? grade : `${grade} (${points})`;
}

/**
 * The module table, with the optional columns only where a row actually carries them, so a
 * qualification with a course list does not show two empty columns beside it.
 */
function buildCourses(claims) {
  const courses = parseCourses(claims.courses);
  if (courses.length === 0) {return null;}

  const columns = [
    { heading: 'Module', value: (course) => courseValue(course, 'courseCode') },
    { heading: 'Title', value: (course) => courseValue(course, 'courseName') },
    { heading: 'Term', value: (course) => courseValue(course, 'term') },
    { heading: 'Credits', value: (course) => courseValue(course, 'credits') },
    { heading: 'Mark', value: courseMark },
  ];
  const optional = [
    { heading: 'Workload', field: 'workloadHours', value: (course) => courseValue(course, 'workloadHours') },
    { heading: 'Required', field: 'grouping', value: (course) => courseValue(course, 'grouping') },
  ];
  for (const column of optional) {
    const carried = courses.some((course) => courseValue(course, column.field) !== '—');
    if (carried) {columns.push(column);}
  }

  return {
    caption: `${courses.length} ${courses.length === 1 ? 'module' : 'modules'} listed in this credential`,
    columns: columns.map((c) => c.heading),
    rows: courses.map((course) => columns.map((c) => c.value(course))),
  };
}

/** The third place a credential can be identified, after its kind and its programme. */
function subjectLine(sections) {
  const qualification = sections.find((s) => s.id === 'qualification');
  if (!qualification) {return null;}
  const read = (label) => qualification.rows.find(([name]) => name === label)?.[1];
  const programme = read('Programme');
  const institution = read('Institution');
  const parts = [programme, institution].filter((part) => part && part !== '—');
  return parts.length ? parts.join(' · ') : null;
}

/**
 * @param {object} share a stored share, as ShareService keeps it
 * @param {{categoryLabels?: string[]}} [context] labels for the sections the holder released,
 *   which the caller can name because it owns the category list
 * @returns {{title: string, subtitle: string|null, kindLabel: string|null, sections: Array,
 *   courses: object|null, share: object, provenance: string}}
 */
export function buildShareDocument(share, { categoryLabels = [] } = {}) {
  const claims = share.claims || {};
  const byKey = new Map();
  for (const [key, value] of Object.entries(claims)) {
    byKey.set(canonicalKey(key), value);
  }

  const claimed = new Set();
  const sections = [];
  for (const section of SECTION_ORDER) {
    const rows = [];
    for (const key of section.keys) {
      if (!byKey.has(key)) {continue;}
      const value = byKey.get(key);
      if (key === 'courses') {continue;}
      claimed.add(key);
      rows.push([LABELS[key] || labelFor(key), formatClaimValue(value)]);
    }
    if (rows.length) {sections.push({ id: section.id, heading: section.heading, rows }); }
  }

  const otherRows = [];
  for (const [key, value] of byKey.entries()) {
    if (claimed.has(key) || key === 'courses') {continue;}
    otherRows.push([labelFor(key), formatClaimValue(value)]);
  }
  if (otherRows.length) {sections.push({ id: 'other', heading: OTHER_HEADING, rows: otherRows }); }

  const courses = buildCourses(claims);
  const subject = subjectLine(sections);

  return {
    title: share.kindLabel || 'Shared credential',
    subtitle: subject,
    kindLabel: share.kindLabel || null,
    lede:
      'Every value below comes from the credential itself, as signed by the institution that issued ' +
      'it. Nothing here was typed in by the sender, and only the parts the holder chose to release ' +
      'are shown.',
    sections,
    courses,
    share: {
      reference: share.shareId,
      sharedBy: share.senderEmail || 'a verified holder',
      sharedWith: share.recipientName || null,
      message: share.message || null,
      sharedOn: share.createdAt ? formatClaimDate(share.createdAt) : null,
      accessUntil: share.expiresAt ? formatClaimDate(share.expiresAt) : null,
      generatedOn: formatClaimDate(new Date().toISOString()),
      disclosedSections: categoryLabels,
      // Said plainly, and only what actually happened: the signature was checked and the
      // credential's revocation status was read at that moment. Neither survives into this
      // document, so neither is claimed to.
      checks: [
        "The issuing institution's signature on the credential was checked.",
        "The credential's revocation status was read, and it was not revoked.",
        'The holder released these fields from their own wallet.',
      ],
    },
    provenance:
      'Verified in the Quals network when this document was shared. Quals keeps no copy of the ' +
      'credential or of this document.',
  };
}

export default buildShareDocument;
