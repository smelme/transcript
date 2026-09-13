#!/usr/bin/env node

/**
 * Development database helpers.
 *
 *   npm run db:reset   delete the development database and recreate an empty schema
 *   npm run db:seed    create the fixtures the demo needs to be usable
 *
 * Why this exists: every test run and every demo writes into one SQLite file. Issuance sessions
 * record which wallet claimed a credential, so after a few runs the academy's claim list shows
 * credentials that a freshly installed wallet never held, and the portal reports "In wallet" for a
 * device that has never seen them. That looked like a bug in claim-aware reuse and was not: it was
 * leftover rows. Starting from a known state is the fix.
 *
 * Deliberately not seeded: credentials themselves, and wallet accounts. A credential is only real
 * once the issuer has signed it, so seeded credentials would be metadata pretending to be a
 * credential - the exact confusion this script exists to remove. Wallets enrol themselves when the
 * app is first opened, and the academy issues credentials through its normal flow.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, DB_PATH_INFO } from '../db.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const command = (process.argv[2] || '').toLowerCase();

// The demo institutions. `institution` is the scope key every credential already carries, and the
// scope the portal filters on, so these strings must match what the demo issues under.
const DEMO_ORGS = [
  { institution: 'Smart Academy', name: 'Smart Academy (example issuing authority)' },
  { institution: 'Trust University', name: 'Trust University (example relying party)' },
];

// One platform administrator and one scoped to each demo organisation. Credentials come from the
// environment so a deployment never ships with a documented default.
const DEMO_ADMINS = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@quals.local',
    password: process.env.ADMIN_PASSWORD || 'quals-admin-2026',
    role: 'admin',
    institution: null,
    label: 'platform administrator',
  },
  {
    email: process.env.ACADEMY_ADMIN_EMAIL || 'registrar@smartacademy.example',
    password: process.env.ACADEMY_ADMIN_PASSWORD || 'academy-admin-2026',
    role: 'admin',
    institution: 'Smart Academy',
    label: 'Smart Academy administrator',
  },
];

function refuse(reason) {
  console.error(`Refusing to run: ${reason}`);
  console.error(`Database: ${DB_PATH_INFO}`);
  process.exit(1);
}

/**
 * Guard rails. Both commands destroy or write development data, so they stop in the two situations
 * where that is unacceptable: a production run, and a database outside this repository's data
 * directory (a developer who pointed DATABASE_PATH at something real).
 */
function assertSafeTarget() {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    refuse('NODE_ENV is production.');
  }
  const resolved = path.resolve(DB_PATH_INFO);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    refuse(
      `the database is outside ${path.relative(REPO_ROOT, DATA_DIR)}. Set DATABASE_PATH to a file ` +
        'inside the repository, or delete it yourself.',
    );
  }
  return resolved;
}

function removeDatabase(resolvedPath) {
  const removed = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const file = resolvedPath + suffix;
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
      removed.push(path.basename(file));
    }
  }
  return removed;
}

async function reset() {
  const resolved = assertSafeTarget();
  const removed = removeDatabase(resolved);
  // Recreate the schema (and any migration columns) by opening the database once.
  getDb().close();
  console.log(
    removed.length
      ? `Removed ${removed.join(', ')} and recreated an empty schema.`
      : 'No database existed; created an empty schema.',
  );
  console.log(`Database: ${resolved}`);
  console.log('Next: npm run db:seed, then start the services and issue a credential.');
}

async function seed() {
  assertSafeTarget();
  const db = getDb();
  const now = new Date().toISOString();

  const org = db.prepare(
    'INSERT INTO client_orgs (institution, name, created_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(institution) DO UPDATE SET name = excluded.name',
  );
  for (const entry of DEMO_ORGS) {
    org.run(entry.institution, entry.name, now);
  }

  // Imported lazily so the guards above run before anything touches the database, and so a
  // failure to load the service module reports as itself. An administrator with no institution is
  // a platform administrator, which is what the portal treats as spanning every organisation.
  const { AdminAuthService } = await import('../issuer-service/src/admin-auth.js');
  const adminAuth = new AdminAuthService({ issuerId: process.env.ISSUER_ID || 'issuer-001' });
  const created = [];
  for (const admin of DEMO_ADMINS) {
    if (adminAuth.listAdmins().some((existing) => existing.email === admin.email)) {
      console.log(`Admin already present: ${admin.email}`);
      continue;
    }
    await adminAuth.createAdmin({
      email: admin.email,
      password: admin.password,
      role: admin.role,
      institution: admin.institution,
    });
    created.push(admin);
    console.log(`Created ${admin.label}: ${admin.email}`);
  }

  console.log(`\nSeeded ${DEMO_ORGS.length} organisations and ${created.length} administrators.`);
  console.log('Sign in to the portal (http://localhost:3004) with one of the accounts above.');
  console.log(
    'Credentials are issued through the academy flow, so the mdoc bytes are signed for real.',
  );
  if (created.length) {
    console.log('\nChange these passwords before using this data anywhere but a local demo.');
  }
}

function usage() {
  console.log(`Usage: node scripts/dev-database.mjs <reset|seed>

  reset   delete the development database and recreate an empty schema
  seed    create the demo organisations and administrators
`);
}

if (command === 'reset') {
  await reset();
} else if (command === 'seed') {
  await seed();
} else {
  usage();
  process.exit(command ? 1 : 0);
}
