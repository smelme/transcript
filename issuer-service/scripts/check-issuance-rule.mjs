/**
 * Print what Smart Academy issues, by the rule.
 *
 * The shape of a credential follows from the programme and how far the student has got, so the
 * only way to check the rule is to read what comes out: which blocks each item carries, which
 * terms the transcript covers, and whether an in-progress study says so.
 *
 * Run: node issuer-service/scripts/check-issuance-rule.mjs
 */
import { generateStudentItems, DEMO_ENROLMENTS } from '../src/credential-generator.js';

const items = generateStudentItems({
  institution: 'Smart Academy',
  studentId: 'SA-DEMO01',
  fullName: 'Amara Okafor',
});

console.log('Enrolments: ' + DEMO_ENROLMENTS.map((e) => e.code + ' (' + e.progress + ')').join(', '));
console.log('');

for (const item of items) {
  const data = item.credentialData;
  const blocks = ['education_qualification', 'education_transcript']
    .filter((key) => data[key])
    .join(' + ') || 'nothing';

  console.log(item.programmeCode + '  ' + item.progress + '  ->  ' + item.kind);
  console.log('  title:   ' + item.display.title);
  console.log('  carries: ' + blocks);

  const transcript = data.education_transcript;
  if (transcript) {
    const terms = [...new Set(transcript.courses.map((course) => course.term))];
    console.log('  terms:   ' + terms.join(', '));
    console.log('  outcome: ' + transcript.outcome + '   ends: ' + transcript.enrolment_end);
  }
  if (data.education_qualification) {
    console.log('  awarded: ' + (data.education_qualification.graduation_date || '(not yet)'));
  }
  console.log('');
}

console.log('items: ' + items.length);
