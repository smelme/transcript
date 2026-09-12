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
  // `cip` is the programme's subject in the US CIP 2020 taxonomy, `award` the title the record
  // leads to, and `alt` the title as the institution publishes it in its own second language.
  // All four belong to the institution's programme catalogue; these are the demo's values and
  // the academy's own list replaces them when it supplies one.
  { level: 'Bachelor', field: 'Computer Science', code: 'BSC-CS', cip: '11.0101', award: 'Bachelor of Science', alt: 'Informatica' },
  { level: 'Bachelor', field: 'Business Administration', code: 'BSC-BA', cip: '52.0201', award: 'Bachelor of Business Administration', alt: 'Bedrijfskunde' },
  { level: 'Bachelor', field: 'Mechanical Engineering', code: 'BSC-ME', cip: '14.1901', award: 'Bachelor of Science', alt: 'Werktuigbouwkunde' },
  { level: 'Bachelor', field: 'Psychology', code: 'BSC-PS', cip: '42.0101', award: 'Bachelor of Arts', alt: 'Psychologie' },
  { level: 'Master', field: 'Data Science', code: 'MSC-DS', cip: '30.7001', award: 'Master of Science', alt: 'Datawetenschap' },
  { level: 'Master', field: 'Public Health', code: 'MSC-PH', cip: '51.2201', award: 'Master of Public Health', alt: 'Volksgezondheid' },
  { level: 'Master', field: 'Finance', code: 'MSC-FI', cip: '52.0801', award: 'Master of Science', alt: 'Financien' },
  { level: 'Master', field: 'Architecture', code: 'MSC-AR', cip: '04.0201', award: 'Master of Architecture', alt: 'Architectuur' },
];

/**
 * Recognition details (P0-21 Tier 2): who the institution is beyond its name, what the codes
 * are codes in, how much work a module was, and who attested the document.
 *
 * These are the demo's samples, shaped the way a real institution would supply them - a SCHAC
 * identifier is a domain, an Erasmus code is the country and city form, a ROR identifier is a
 * URL. They are fixed rather than generated, because an identifier that changes per student is
 * not an identifier; the academy's own values replace them verbatim.
 */
export const RECOGNITION_SAMPLES = {
  institutionId: 'smartacademy.example',
  institutionIdScheme: 'schac',
  institutionRor: 'https://ror.org/04demo123',
  institutionErasmusCode: 'NL AMSTERD01',
  learnerIdScheme: 'institution-student-number',
  courseCodeScheme: 'institution-course-catalogue',
  institutionNameAlt: 'Smart Academie',
  institutionNameAltLanguage: 'nl',
  languageOfInstruction: 'en',
  attestingOffice: 'Office of the Registrar',
  attestingCapacity: 'Registrar',
  transcriptType: 'official-transcript',
  documentVersion: '1',
};

/**
 * How much work a module was: US practice counts one credit hour as fifteen contact hours and
 * forty-five hours of total student work over a fifteen-week semester.
 */
const CONTACT_HOURS_PER_CREDIT = 15;
const WORKLOAD_HOURS_PER_CREDIT = 45;

/**
 * The grading scheme every record in this demo is issued under: the US 4.00 grade point
 * average scale, with the pass mark that scale is normally read at. Stated in the credential
 * as a scale of its own, so a reader never has to assume what a number means.
 */
export const US_GRADING_SCALE = {
  id: 'us-gpa-4',
  label: 'US 4.00 grade point average scale',
  minimum: 0,
  maximum: 4,
  passMark: 2,
};

/** The credit unit: US semester credit hours. */
export const US_CREDIT_SCHEME = 'us-credit-hour';

/**
 * Letter grades with their 4.00 scale values and how often the demo awards each. Every
 * attempt shown passed: an `F` would be an attempt that earned nothing, and this record has
 * none - the elements exist so a record that does can say so.
 */
const LETTER_GRADES = [
  { letter: 'A', points: 4.0, weight: 18 },
  { letter: 'A-', points: 3.7, weight: 12 },
  { letter: 'B+', points: 3.3, weight: 14 },
  { letter: 'B', points: 3.0, weight: 14 },
  { letter: 'B-', points: 2.7, weight: 10 },
  { letter: 'C+', points: 2.3, weight: 8 },
  { letter: 'C', points: 2.0, weight: 6 },
  { letter: 'C-', points: 1.7, weight: 4 },
  { letter: 'D', points: 1.0, weight: 2 },
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
 * The document type both credential kinds are issued under: a photo-ID document carrying
 * the holder's personal components.
 */
export const PHOTOID_DOCTYPE = 'org.iso.23220.photoid.1';

export const PHOTOID_NAMESPACE = 'org.iso.23220.photoid.1';
export const QUALIFICATION_NAMESPACE = 'org.iso.23220.education.qualification.1';
export const TRANSCRIPT_NAMESPACE = 'org.iso.23220.education.transcript.1';

/**
 * The US-practice supplement to the transcript: the same study in the reader's units, the
 * figures that reader computes, and the standing of the record itself. Separate from the
 * transcript namespace because it answers a different question - not what was studied, but
 * what a credit-hour registrar needs on top of it, and how the record stands as a document.
 */
export const ACADEMIC_RECORD_NAMESPACE = 'org.iso.23220.education.academic-record.1';

/**
 * The credential kinds this issuer offers, keyed by kind.
 *
 * Both kinds are issued under the same docType - a photo-ID document carrying the
 * holder's personal components - and are told apart by the academic namespace they
 * hold: the qualification credential carries the qualification claims, the transcript
 * credential carries the grades. A relying party selects by namespace, not by docType.
 */
export const CREDENTIAL_KINDS = {
  qualification: {
    label: 'Qualification',
    docType: PHOTOID_DOCTYPE,
    academicNamespace: QUALIFICATION_NAMESPACE,
    academicField: 'education_qualification',
    namespaces: [PHOTOID_NAMESPACE, QUALIFICATION_NAMESPACE],
  },
  transcript: {
    label: 'Academic transcript',
    docType: PHOTOID_DOCTYPE,
    academicNamespace: TRANSCRIPT_NAMESPACE,
    academicField: 'education_transcript',
    namespaces: [PHOTOID_NAMESPACE, TRANSCRIPT_NAMESPACE],
  },
};

export const DEFAULT_KIND = 'qualification';

/**
 * The kinds a request asks for: `qualification` (the default and historic behaviour),
 * `transcript`, or `both`. Anything unrecognised is treated as `qualification` rather
 * than rejected here, so a typo cannot silently issue two credentials.
 */
export function requestedKinds(include) {
  const value = String(include ?? '').trim().toLowerCase();
  if (value === 'transcript') return ['transcript'];
  if (value === 'both') return ['qualification', 'transcript'];
  return [DEFAULT_KIND];
}

/**
 * The kind a credential carries, decided by the academic namespace it holds rather than
 * by its docType (which both kinds share). A credential holding both is one combined
 * academic credential, which is what this issuer produced before the choice existed.
 */
export function kindOfCredentialData(credentialData = {}) {
  const hasQualification = Boolean(credentialData.education_qualification);
  const hasTranscript = Boolean(credentialData.education_transcript);
  if (hasQualification && hasTranscript) return 'academic';
  if (hasTranscript) return 'transcript';
  if (hasQualification) return 'qualification';
  return 'credential';
}

/** How a credential should be labelled, from the claims it actually holds. */
export function labelOfCredentialData(credentialData) {
  const kind = kindOfCredentialData(credentialData);
  if (kind === 'academic') return 'Qualification and transcript';
  return CREDENTIAL_KINDS[kind]?.label || 'Credential';
}

/**
 * The academic namespaces a credential holds: one for a qualification or a transcript,
 * both for a combined academic credential, none for an identity-only credential. This is
 * what tells the two kinds apart, since they share a docType.
 */
export function academicNamespacesOf(credentialData = {}) {
  return Object.values(CREDENTIAL_KINDS)
    .filter((spec) => Boolean(credentialData[spec.academicField]))
    .map((spec) => spec.academicNamespace);
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
 * US-style semesters, oldest first, ending with the term a study finishes in. An academic
 * year N runs Fall N (late August to mid December) then Spring N+1 (mid January to mid May),
 * so the terms of a record are counted backwards from its final one and the record never
 * runs past the graduation it leads to. The demo's academic calendar; the academy's own
 * dates replace them when it supplies them.
 */
function usTermsEndingAt(lastAcademicYear, count) {
  const terms = [];
  for (let back = 0; back < count; back += 1) {
    const academicYear = lastAcademicYear - Math.floor(back / 2);
    const isSpring = back % 2 === 0;
    terms.unshift(
      isSpring
        ? {
            title: `Spring ${academicYear + 1}`,
            start: `${academicYear + 1}-01-16`,
            end: `${academicYear + 1}-05-10`,
          }
        : {
            title: `Fall ${academicYear}`,
            start: `${academicYear}-08-28`,
            end: `${academicYear}-12-15`,
          },
    );
  }
  return terms;
}

/** A letter grade drawn from the demo's distribution, with its 4.00-scale value. */
function pickLetterGrade(rng) {
  const total = LETTER_GRADES.reduce((sum, grade) => sum + grade.weight, 0);
  let roll = rng() * total;
  for (const grade of LETTER_GRADES) {
    roll -= grade.weight;
    if (roll <= 0) return grade;
  }
  return LETTER_GRADES[0];
}

/**
 * Build the academic record for a student, projected onto the requested kinds.
 *
 * `recognition` decides whether the record also carries the recognition details (Tier 2): who
 * the institution is beyond its name, what its codes are codes in, how much work each module
 * was, and who attested the document. They are optional because they are recognisability rather
 * than interpretability - a record without them still reads - and because every element enlarges
 * what a presentation can disclose.
 *
 * @param {{ institution: string, studentId: string, fullName?: string, include?: string,
 *   recognition?: boolean }} input
 * @returns {{ records: Array<{ kind: string, label: string, docType: string,
 *   academicNamespace: string, recognition: boolean, credentialData: object, display: object }> }}
 */
export function generateAcademicRecord({
  institution,
  studentId,
  fullName,
  include = DEFAULT_KIND,
  recognition = true,
}) {
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

  // ── The study ──────────────────────────────────────────────────────────
  const pool = COURSE_POOL[programme.code] || COURSE_POOL['BSC-CS'];
  const courseCount = Math.min(pool.length, 5 + Math.floor(rng() * 2));
  const firstTermYear = graduationYear - (programme.level === 'Master' ? 1 : 2);
  // Graduation falls in June or July, which is the end of the academic year that began the
  // previous August, so the final term is that year's Spring.
  const lastAcademicYear = graduationYear - 1;
  const terms = usTermsEndingAt(lastAcademicYear, programme.level === 'Master' ? 4 : 6);

  // Chosen by shuffling the programme's pool with the seeded generator: the same student
  // always gets the same record, and the record always holds the intended number of courses
  // - drawing at random and stopping at the first repeat could quietly return fewer.
  const order = pool.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const courses = [];
  for (const idx of order.slice(0, courseCount)) {
    const [courseCode, courseName] = pool[idx];
    const grade = pickLetterGrade(rng);
    // A project, thesis or studio carries more credit hours than a taught module, as it does
    // on a US record; everything else here is a standard three- or four-hour course.
    const isProject = /Project|Thesis|Studio/i.test(courseName);
    const credits = isProject ? 6 : 3 + Math.floor(rng() * 2);
    const term = terms[Math.min(terms.length - 1, courses.length)];
    const course = {
      courseCode,
      courseName,
      credits,
      grade: grade.letter,
      gradePoints: grade.points,
      markScaleId: US_GRADING_SCALE.id,
      outcome: grade.points >= US_GRADING_SCALE.passMark ? 'passed' : 'failed',
      term: term.title,
      termStart: term.start,
      termEnd: term.end,
    };
    if (recognition) {
      // A registrar needs to map the module onto their own programme, which means knowing how
      // much work it was, whether it was required, and how the cohort did on it.
      Object.assign(course, {
        codeScheme: RECOGNITION_SAMPLES.courseCodeScheme,
        grouping: courses.length < 3 || isProject ? 'mandatory' : 'optional',
        componentType: /Studio/i.test(courseName)
          ? 'studio'
          : /Project|Thesis/i.test(courseName)
            ? 'project'
            : 'lecture',
        contactHours: credits * CONTACT_HOURS_PER_CREDIT,
        workloadHours: credits * WORKLOAD_HOURS_PER_CREDIT,
        cohortSize: 18 + Math.floor(rng() * 40),
        cohortMeanGradePoint: Math.round((2.4 + rng() * 0.9) * 100) / 100,
      });
    }
    courses.push(course);
  }

  // The aggregates are computed from the marks rather than asserted, credit-weighted, and
  // the arithmetic travels with the credential so a reader can check it: quality points are
  // the sum of (grade points x credit hours), and the average is that sum over the credits
  // counted towards it. Every attempt on this record passed, so attempted and earned are
  // equal here - the elements exist so a record where they differ can say so.
  const creditsAttempted = courses.reduce((sum, course) => sum + course.credits, 0);
  const creditsEarned = courses
    .filter((course) => course.outcome === 'passed')
    .reduce((sum, course) => sum + course.credits, 0);
  const creditsForAverage = creditsAttempted;
  const qualityPoints =
    Math.round(courses.reduce((sum, course) => sum + course.gradePoints * course.credits, 0) * 100) / 100;
  const gpa = creditsForAverage
    ? Math.round((qualityPoints / creditsForAverage) * 100) / 100
    : 0;

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
      // The scale the number is on, stated beside it: the same scheme the transcript's marks
      // use, so it is never read as a mark out of ten or as a percentage.
      gpa_scale_id: US_GRADING_SCALE.id,
      gpa_scale_maximum: US_GRADING_SCALE.maximum,
      ...(recognition
        ? {
            // An employer checking an award needs to recognise the institution, not just read
            // its name, so the same identifiers travel with the qualification.
            institution_id: RECOGNITION_SAMPLES.institutionId,
            institution_id_scheme: RECOGNITION_SAMPLES.institutionIdScheme,
            institution_ror: RECOGNITION_SAMPLES.institutionRor,
            institution_name_alt: RECOGNITION_SAMPLES.institutionNameAlt,
            language_of_instruction: RECOGNITION_SAMPLES.languageOfInstruction,
            field_of_study_alt: programme.alt,
          }
        : {}),
    },
    education_transcript: {
      // Who and where
      institution_name: institution,
      student_id: studentId,
      // Programme context: the classification code names its own scheme, and the level names
      // the framework that defines it, so neither is a bare number or a bare word.
      programme_title: qualificationTitle,
      programme_type: 'degree',
      programme_code: programme.cip,
      programme_code_scheme: 'CIP-2020',
      programme_level: programme.level === 'Master' ? "Master's degree" : "Bachelor's degree",
      programme_level_framework: 'IPEDS-award-level',
      award_title: programme.award,
      enrolment_start: terms[0].start,
      enrolment_end: graduationDate,
      // How marks and credits are scaled
      grading_scale_id: US_GRADING_SCALE.id,
      grading_scale_label: US_GRADING_SCALE.label,
      grading_scale_minimum: US_GRADING_SCALE.minimum,
      grading_scale_maximum: US_GRADING_SCALE.maximum,
      grading_scale_pass_mark: US_GRADING_SCALE.passMark,
      credit_scheme: US_CREDIT_SCHEME,
      total_credits: creditsEarned,
      // What was studied, and how it ended
      courses,
      outcome: 'completed',
      outcome_scheme: 'programme-outcome',
      // Aggregates, as their own elements so a summary can be disclosed without the course
      // list - the list is one element and therefore all or nothing.
      overall_mark: gpa,
      overall_mark_scale_id: US_GRADING_SCALE.id,
      credits_attempted: creditsAttempted,
      credits_earned: creditsEarned,
      // Kept so a credential issued before the outcome vocabulary existed stays readable.
      status: 'completed',
      ...(recognition
        ? {
            // Recognition details: who the institution is beyond its name, what its codes are
            // codes in, and in which language the study was taught.
            institution_id: RECOGNITION_SAMPLES.institutionId,
            institution_id_scheme: RECOGNITION_SAMPLES.institutionIdScheme,
            institution_ror: RECOGNITION_SAMPLES.institutionRor,
            institution_erasmus_code: RECOGNITION_SAMPLES.institutionErasmusCode,
            institution_name_alt: RECOGNITION_SAMPLES.institutionNameAlt,
            institution_name_alt_language: RECOGNITION_SAMPLES.institutionNameAltLanguage,
            programme_title_alt: programme.alt,
            programme_title_alt_language: RECOGNITION_SAMPLES.institutionNameAltLanguage,
            language_of_instruction: RECOGNITION_SAMPLES.languageOfInstruction,
            student_id_scheme: RECOGNITION_SAMPLES.learnerIdScheme,
          }
        : {}),
    },
    education_academic_record: {
      // The same study in the reader's own units, and the figures that reader computes.
      credit_hours_scheme: US_CREDIT_SCHEME,
      credit_hours_attempted: creditsAttempted,
      credit_hours_earned: creditsEarned,
      credit_hours_for_average: creditsForAverage,
      average_cumulative: gpa,
      average_weighting: 'credit-weighted',
      average_range_minimum: US_GRADING_SCALE.minimum,
      average_range_maximum: US_GRADING_SCALE.maximum,
      quality_points: qualityPoints,
      // The record as a document. Its identity is the record's own, not the identity
      // document's number: they are different artefacts, which is why both are carried.
      document_type: 'academic-record',
      document_id: `AR-${String(seedFrom(studentId) % 1000000).padStart(6, '0')}`,
      document_issued_at: issueDate,
      document_status: 'official',
      // This demo record is an excerpt of the programme rather than the whole of it, and it
      // says so instead of claiming to be complete.
      document_completeness: 'partial',
      ...(recognition
        ? {
            // Which document this is, and who attested it in what capacity: a registrar can
            // check the attestation against a known office rather than a known person.
            transcript_type: RECOGNITION_SAMPLES.transcriptType,
            document_version: RECOGNITION_SAMPLES.documentVersion,
            attesting_office: RECOGNITION_SAMPLES.attestingOffice,
            attesting_capacity: RECOGNITION_SAMPLES.attestingCapacity,
          }
        : {}),
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
    totalCredits: creditsEarned,
    courseCount: courses.length,
    gpa,
    recognition,
  };

  // Each credential carries the personal components plus only its own academic
  // namespace: the holder chooses the kind, and a relying party must never receive
  // qualification claims it did not ask for (or the reverse).
  const records = requestedKinds(include).map((kind) => {
    const spec = CREDENTIAL_KINDS[kind];
    const credentialData = { docType: spec.docType };
    for (const field of IDENTITY_FIELDS) credentialData[field] = record[field];
    credentialData[spec.academicField] = record[spec.academicField];
    // The US-practice supplement rides with the transcript: it describes the same study and
    // the record's own standing, so a transcript without it would be missing exactly what a
    // registrar reads. A qualification credential does not carry it.
    if (kind === 'transcript') {
      credentialData.education_academic_record = record.education_academic_record;
    }

    return {
      kind,
      label: spec.label,
      docType: spec.docType,
      academicNamespace: spec.academicNamespace,
      // Whether this record carries the recognition details, so a caller can tell what it got.
      recognition,
      credentialData,
      display: {
        ...display,
        kind,
        label: spec.label,
        title:
          kind === 'transcript'
            ? `Academic transcript — ${programme.level} of ${programme.field}`
            : qualificationTitle,
      },
    };
  });

  return { records };
}

export default {
  generateAcademicRecord,
  CREDENTIAL_KINDS,
  DEFAULT_KIND,
  PHOTOID_DOCTYPE,
  requestedKinds,
  kindOfCredentialData,
  labelOfCredentialData,
  academicNamespacesOf,
};
