import crypto from 'crypto';

/**
 * Random academic claim generator for the Smart Academy demo.
 *
 * The demo does not ask the applicant to fill in a form: the academy "has the
 * record on file", so we synthesise a plausible qualification + transcript.
 * Values are deterministic for a given (institution, studentId) seed so a
 * person always sees the same record, but differ between people.
 */

const FIRST_NAMES = [
  'Amara', 'Noah', 'Sofia', 'Liam', 'Priya', 'Mateo', 'Yuki', 'Elena', 'Omar', 'Ingrid',
  'Ravi', 'Clara', 'Tomas', 'Aisha', 'Jonas', 'Mei', 'Diego', 'Freya', 'Hassan', 'Nadia',
];

const LAST_NAMES = [
  'Okafor', 'Bennett', 'Almeida', 'Novak', 'Sharma', 'Reyes', 'Tanaka', 'Kowalski', 'Haddad', 'Lindqvist',
  'Nair', 'Moreau', 'Petrov', 'Abdi', 'Larsen', 'Chen', 'Fernandez', 'Sorensen', 'Karim', 'Voss',
];

const COUNTRIES = [
  { code: 'NL', label: 'Netherlands' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'IE', label: 'Ireland' },
  { code: 'ES', label: 'Spain' },
];

const PROGRAMMES = [
  { level: 'Bachelor', field: 'Computer Science', code: 'BSC-CS' },
  { level: 'Bachelor', field: 'Business Administration', code: 'BSC-BA' },
  { level: 'Bachelor', field: 'Mechanical Engineering', code: 'BSC-ME' },
  { level: 'Bachelor', field: 'Psychology', code: 'BSC-PS' },
  { level: 'Master', field: 'Data Science', code: 'MSC-DS' },
  { level: 'Master', field: 'Public Health', code: 'MSC-PH' },
  { level: 'Master', field: 'Finance', code: 'MSC-FI' },
  { level: 'Master', field: 'Architecture', code: 'MSC-AR' },
];

const COURSE_POOL = {
  'BSC-CS': [
    ['CS101', 'Foundations of Programming', 6],
    ['CS201', 'Data Structures & Algorithms', 6],
    ['CS210', 'Databases', 6],
    ['CS230', 'Operating Systems', 6],
    ['CS301', 'Software Engineering', 6],
    ['CS320', 'Machine Learning', 6],
    ['MA110', 'Discrete Mathematics', 6],
    ['MA120', 'Linear Algebra', 6],
  ],
  'BSC-BA': [
    ['BA101', 'Principles of Management', 6],
    ['BA110', 'Financial Accounting', 6],
    ['BA204', 'Marketing Management', 6],
    ['BA220', 'Organisational Behaviour', 6],
    ['EC101', 'Microeconomics', 6],
    ['ST110', 'Business Statistics', 6],
  ],
  'BSC-ME': [
    ['ME101', 'Engineering Mechanics', 6],
    ['ME120', 'Thermodynamics', 6],
    ['ME210', 'Materials Science', 6],
    ['ME230', 'Fluid Mechanics', 6],
    ['MA150', 'Engineering Mathematics', 6],
  ],
  'BSC-PS': [
    ['PS101', 'Introduction to Psychology', 6],
    ['PS120', 'Research Methods', 6],
    ['PS210', 'Cognitive Psychology', 6],
    ['PS230', 'Social Psychology', 6],
    ['ST100', 'Statistics for Behavioural Science', 6],
  ],
  'MSC-DS': [
    ['DS501', 'Statistical Learning', 6],
    ['DS510', 'Big Data Systems', 6],
    ['DS520', 'Deep Learning', 6],
    ['DS530', 'Research Project', 18],
    ['DS540', 'Data Ethics & Governance', 6],
  ],
  'MSC-PH': [
    ['PH501', 'Epidemiology', 6],
    ['PH510', 'Health Policy & Systems', 6],
    ['PH520', 'Biostatistics', 6],
    ['PH530', 'Global Health', 6],
    ['PH540', 'Research Project', 18],
  ],
  'MSC-FI': [
    ['FI501', 'Corporate Finance', 6],
    ['FI510', 'Asset Pricing', 6],
    ['FI520', 'Risk Management', 6],
    ['FI530', 'Financial Econometrics', 6],
    ['FI540', 'Research Project', 18],
  ],
  'MSC-AR': [
    ['AR501', 'Design Studio', 12],
    ['AR510', 'Urban Theory', 6],
    ['AR520', 'Sustainable Structures', 6],
    ['AR530', 'Thesis', 18],
  ],
};

/** Deterministic 32-bit hash so the same student always gets the same record. */
function seedFrom(...parts) {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest();
  return hash.readUInt32BE(0);
}

function makeRng(seed) {
  let state = seed || 1;
  return () => {
    // xorshift32 — small, deterministic, good enough for demo data.
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The credential kinds this issuer issues, keyed by the docType carried in the mdoc.
 *
 * Both kinds carry the holder's identity so a relying party can bind the claims to a
 * person; each kind adds only the namespace that belongs to it, so a transcript
 * credential never carries qualification claims and vice versa.
 */
export const CREDENTIAL_KINDS = {
  'org.iso.23220.photoid.1': {
    kind: 'qualification',
    label: 'Qualification',
    namespaces: ['org.iso.23220.photoid.1', 'org.iso.23220.education.qualification.1'],
  },
  'org.iso.23220.education.transcript.1': {
    kind: 'transcript',
    label: 'Academic transcript',
    namespaces: ['org.iso.23220.photoid.1', 'org.iso.23220.education.transcript.1'],
  },
};

export const DEFAULT_DOCTYPE = 'org.iso.23220.photoid.1';

/**
 * The docTypes a request asks for: `qualification` (the default and historic
 * behaviour), `transcript`, or `both`. Anything unrecognised is treated as
 * `qualification` rather than rejected here, so a typo cannot silently issue two
 * credentials.
 */
export function requestedDocTypes(include) {
  const value = String(include ?? '').trim().toLowerCase();
  if (value === 'transcript') return ['org.iso.23220.education.transcript.1'];
  if (value === 'both') return [DEFAULT_DOCTYPE, 'org.iso.23220.education.transcript.1'];
  return [DEFAULT_DOCTYPE];
}

/** The identity elements both credential kinds carry. */
const IDENTITY_FIELDS = [
  'full_name',
  'date_of_birth',
  'document_number',
  'issuing_authority',
  'issue_date',
  'expiry_date',
  'issuing_country',
];

/**
 * Build the academic record for a student, projected onto the requested kinds.
 *
 * @param {{ institution: string, studentId: string, fullName?: string, include?: string }} input
 * @returns {{ records: Array<{ kind: string, label: string, docType: string,
 *   credentialData: object, display: object }> }}
 */
export function generateAcademicRecord({ institution, studentId, fullName, include = 'qualification' }) {
  const rng = makeRng(seedFrom(institution, studentId));

  const given = fullName?.trim().split(/\s+/)[0] || pick(rng, FIRST_NAMES);
  const family = fullName?.trim().split(/\s+/).slice(1).join(' ') || pick(rng, LAST_NAMES);
  const country = pick(rng, COUNTRIES);
  const programme = pick(rng, PROGRAMMES);

  const birthYear = programme.level === 'Master' ? 1994 + Math.floor(rng() * 6) : 1999 + Math.floor(rng() * 5);
  const birthMonth = 1 + Math.floor(rng() * 12);
  const birthDay = 1 + Math.floor(rng() * 27);

  const graduationYear = programme.level === 'Master' ? 2024 + Math.floor(rng() * 2) : 2023 + Math.floor(rng() * 3);
  const graduationMonth = 6 + Math.floor(rng() * 2); // Jun/Jul
  const graduationDate = isoDate(graduationYear, graduationMonth, 30);

  const issueDate = isoDate(graduationYear, Math.min(12, graduationMonth + 1), 15);
  const expiryYear = graduationYear + 10;
  const expiryDate = isoDate(expiryYear, graduationMonth, 30);

  const gpa = Math.round((3.0 + rng() * 1.0) * 100) / 100; // 3.00 – 4.00

  const pool = COURSE_POOL[programme.code] || COURSE_POOL['BSC-CS'];
  const courseCount = Math.min(pool.length, 5 + Math.floor(rng() * 2));
  const courses = [];
  const used = new Set();
  while (courses.length < courseCount) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    if (used.has(idx)) break;
    used.add(idx);
    const [courseCode, courseName, credits] = pool[idx];
    const grade = (5.5 + rng() * 4.5).toFixed(1); // 5.5 – 10.0
    courses.push({ courseCode, courseName, credits, grade: Number(grade) });
  }
  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);

  const documentNumber = `SA-${String(seedFrom(studentId) % 1000000).padStart(6, '0')}`;
  const qualificationTitle = `${programme.level} of ${programme.field}`;

  const record = {
    full_name: `${given} ${family}`,
    date_of_birth: isoDate(birthYear, birthMonth, birthDay),
    document_number: documentNumber,
    issuing_authority: institution,
    issue_date: issueDate,
    expiry_date: expiryDate,
    issuing_country: country.code,
    education_qualification: {
      institution_name: institution,
      degree_level: programme.level,
      field_of_study: programme.field,
      graduation_date: graduationDate,
      gpa,
    },
    education_transcript: {
      student_id: studentId,
      courses,
      total_credits: totalCredits,
      status: 'completed',
    },
  };

  const display = {
    title: qualificationTitle,
    institution,
    degreeLevel: programme.level,
    fieldOfStudy: programme.field,
    graduationDate,
    studentId,
    country: country.label,
    totalCredits,
    courseCount: courses.length,
    gpa,
  };

  // Each credential carries only its own academic namespace: the holder chooses the
  // kind, and a relying party must never receive qualification claims it did not ask
  // for (or the reverse).
  const records = requestedDocTypes(include).map((docType) => {
    const spec = CREDENTIAL_KINDS[docType];
    const credentialData = { docType };
    for (const field of IDENTITY_FIELDS) credentialData[field] = record[field];

    if (spec.kind === 'transcript') {
      credentialData.education_transcript = record.education_transcript;
      return {
        kind: spec.kind,
        label: spec.label,
        docType,
        credentialData,
        display: {
          ...display,
          kind: spec.kind,
          label: spec.label,
          title: `Academic transcript — ${programme.level} of ${programme.field}`,
        },
      };
    }

    credentialData.education_qualification = record.education_qualification;
    return {
      kind: spec.kind,
      label: spec.label,
      docType,
      credentialData,
      display: { ...display, kind: spec.kind, label: spec.label, title: qualificationTitle },
    };
  });

  return { records };
}

export default { generateAcademicRecord, CREDENTIAL_KINDS, DEFAULT_DOCTYPE, requestedDocTypes };
