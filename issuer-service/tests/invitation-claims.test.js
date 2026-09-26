import { test } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-invitation-claims-${process.pid}-${Date.now()}.db`,
);

const { InvitationService } = await import('../src/invitations.js');

/** The publisher's half, stood in for: what matters here is the shape it is handed. */
function stubIssuer(captured) {
  return {
    createIssuanceSession(args) {
      captured.push(args);
      return { sessionId: `session-${captured.length}`, status: 'pending', display: args.display };
    },
    findIssuanceSessionsFor: () => [],
  };
}

const walletAccounts = { ensureAccountLink: () => ({ sub: 'sub-1' }) };

/** What an institution's own systems send: claims keyed by the namespace they belong to. */
const publishedClaims = {
  'org.iso.23220.photoid.1': { full_name: 'Ada Lovelace', date_of_birth: '1999-01-01' },
  'org.iso.23220.education.qualification.1': {
    institution_name: 'Smart Academy',
    programme_title: 'BSc Computer Science',
    degree_level: 'Bachelor',
    field_of_study: 'Computer Science',
    graduation_date: '2024-06-30',
  },
  'org.iso.23220.education.transcript.1': {
    student_id: 'SA-1001',
    total_credits: 7,
    courses: JSON.stringify([{ courseCode: 'CS101', credits: 3 }]),
  },
};

async function publish() {
  const captured = [];
  const service = new InvitationService({
    issuer: stubIssuer(captured),
    walletAccounts,
    emailSender: null,
    siteUrl: 'https://quals.example',
  });
  const result = await service.create({
    institution: 'Smart Academy',
    holderEmail: 'ada@example.com',
    credentials: [{ claims: publishedClaims }],
  });
  return { captured, result };
}

test('a published credential is stored in the shape the document builder reads', async () => {
  const { captured } = await publish();
  const [args] = captured;

  // The builder reads fields. Published claims arrive keyed by namespace, so without the conversion
  // the session carries nothing the builder recognises and the credential builds as an empty
  // document - which is what happened before this test existed.
  assert.strictEqual(args.credentialData.education_qualification.degree_level, 'Bachelor');
  assert.strictEqual(args.credentialData.education_qualification.graduation_date, '2024-06-30');
  assert.strictEqual(args.credentialData.education_transcript.student_id, 'SA-1001');
  assert.strictEqual(args.credentialData.education_transcript.total_credits, 7);

  // Identity elements sit at the top level, where the builder looks for them.
  assert.strictEqual(args.credentialData.full_name, 'Ada Lovelace');
  assert.strictEqual(args.credentialData.date_of_birth, '1999-01-01');

  // And the namespaces do not travel on as fields of their own.
  assert.strictEqual(args.credentialData['org.iso.23220.education.qualification.1'], undefined);
});

test('the kind and the holder-facing description still come from the published claims', async () => {
  const { result } = await publish();
  const [credential] = result.credentials;

  // The invitation path names its kinds after the shape of the award: a degree carries both blocks.
  assert.strictEqual(credential.kind, 'degree');
  assert.strictEqual(credential.label, 'Qualification and transcript');
  assert.strictEqual(credential.title, 'BSc Computer Science');
  assert.strictEqual(credential.graduationDate, '2024-06-30');
  assert.strictEqual(credential.courseCount, 1);
  assert.strictEqual(result.holderEmail, 'ada@example.com');
  assert.ok(result.inviteUrl.includes('/issue?invitation='));
  assert.strictEqual(result.emailSent, false, 'nothing is emailed when no sender is configured');
});

test('a credential holding neither academic namespace is refused rather than stored', async () => {
  const captured = [];
  const service = new InvitationService({
    issuer: stubIssuer(captured),
    walletAccounts,
    emailSender: null,
    siteUrl: 'https://quals.example',
  });

  await assert.rejects(
    () =>
      service.create({
        institution: 'Smart Academy',
        holderEmail: 'ada@example.com',
        credentials: [{ claims: { 'org.iso.23220.photoid.1': { full_name: 'Ada' } } }],
      }),
    /qualification or a transcript namespace/,
  );
  assert.strictEqual(captured.length, 0, 'nothing is created for a credential that cannot be issued');
});
