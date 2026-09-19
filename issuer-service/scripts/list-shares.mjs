/**
 * Print the shares this demo has created, with the link each one lives at.
 *
 * A share reaches its recipient by email. In local development email is deliberately not
 * configured, so nothing is sent and the link never leaves the machine. This prints what the
 * recipient would have received, which is the fastest way to carry on testing a share.
 *
 * The table it reads is found rather than assumed, since the schema has changed shape more than
 * once and a wrong guess would read as a bug in the share itself.
 *
 * Run: node issuer-service/scripts/list-shares.mjs
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const dbPath = fileURLToPath(new URL('../../data/transcript.db', import.meta.url));
const db = new Database(dbPath, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((row) => row.name);
console.log('tables: ' + tables.join(', '));

const shareTable = tables.find((name) => /share/i.test(name));
if (!shareTable) {
  console.log('No table looks like it holds shares, so nothing was shared yet, or the schema moved.');
  db.close();
  process.exit(0);
}

const columns = db.prepare(`PRAGMA table_info(${shareTable})`).all().map((column) => column.name);
console.log('reading: ' + shareTable + '  (' + columns.join(', ') + ')');

const rows = db.prepare(`SELECT * FROM ${shareTable} ORDER BY rowid DESC LIMIT 5`).all();
if (rows.length === 0) { console.log('That table is empty.'); }

for (const row of rows) {
  const id = row.share_id || row.shareId || row.id || '';
  const recipient = row.recipient_email || row.recipientEmail || row.email || '';
  const status = row.status || row.state || '';
  const created = row.created_at || row.createdAt || '';
  const expires = row.expires_at || row.expiresAt || '';

  console.log('');
  if (recipient) { console.log('to:       ' + recipient); }
  if (status) { console.log('status:   ' + status); }
  if (created) { console.log('created:  ' + created); }
  if (expires) { console.log('expires:  ' + expires); }
  console.log('open:     http://localhost:3002/share/' + id);
}

db.close();
