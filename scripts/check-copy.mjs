/**
 * Find the marks of generated prose in text a person reads.
 *
 * Reads site pages, app strings, the email templates and the PDF, and reports the mechanical tells
 * the copy-editing skill names: em dashes used as a hinge, semicolons joining clauses, stacked
 * hyphens, and the words that say nothing. Comments and code are not copy, so they are skipped.
 *
 * Run: node scripts/check-copy.mjs
 * Exits non-zero while anything is left, so a change can be gated on it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Text a person reads, and how to find it in each kind of file. */
const SURFACES = [
  { dir: 'issuer-frontend/app', ext: ['.tsx', '.jsx'] },
  { dir: 'verifier-frontend/app', ext: ['.tsx', '.jsx'] },
  { dir: 'quals-portal/app', ext: ['.tsx', '.jsx'] },
  { dir: 'trust-university-frontend/app', ext: ['.tsx', '.jsx'] },
  { dir: 'mobile-wallet/app/src/main/kotlin', ext: ['.kt'] },
  { dir: 'issuer-service/src', ext: ['.js'], only: ['email-service.js', 'pdf.js'] },
];

/** The tells. Each is a pattern over a line of visible text, with why it is one. */
const TELLS = [
  {
    // Every dash that is punctuation rather than a range. The en dash is allowed only between
    // digits, where it carries meaning, as in 2020-2021.
    pattern: /[\u2012\u2014\u2015]|(?<!\d)\u2013|\u2013(?!\d)/,
    why: 'a dash used as punctuation: use a comma, a colon or a full stop instead',
  },
  {
    pattern: /\w{2,}\s--\s\w{2,}/,
    why: 'a stacked hyphen standing in for punctuation',
  },
  {
    pattern: /\b\w+\s*;\s+\w+/,
    why: 'a semicolon joining two ideas: they are two sentences',
  },
  {
    pattern: /\b(leverage|utilise|utilize|empower|seamless|seamlessly|robust|comprehensive|delve|effortless|cutting-edge|state-of-the-art)\b/i,
    // `unlock` is not on this list: in this product it means an actual lock, and the wallet is
    // full of them.
    why: 'a word that says nothing',
  },
  {
    pattern: /\bnot just\b[^.]{3,40}\bbut\b/i,
    why: '"not just X but Y": assert the thing instead',
  },
  {
    pattern: /\bwhether you'?re\b|\bwhether you are\b/i,
    why: 'the "whether you are X or Y" construction',
  },
  {
    pattern: /!["'<]|!$/,
    why: 'an exclamation mark in product copy',
  },
];

/** Lines that are code, not copy. */
const NOT_COPY = [
  /^\s*(\/\/|\*|\/\*)/,
  /^\s*import\s/,
  /^\s*(const|let|var|function|export|return|class|if|for|while)\b/,
  /^\s*<\/?[A-Za-z]/,
  /^\s*@/,
  /className=|style=|aria-|data-|useState|=>|=>\s*\{/,
  // Diagnostics, not copy: nobody reading a log line needs it to read well.
  /Log\.[a-z]+\(|console\.(log|warn|error)\(/i,
];

/** The visible text on a line: JSX text, and string literals that read like a sentence. */
function visibleText(line) {
  const quoted = [...line.matchAll(/(["'`])([^"'`]{12,})\1/g)].map((m) => m[2]);
  const jsx = [...line.matchAll(/>([^<>{}]{12,})</g)].map((m) => m[1]);
  const text = [...quoted, ...jsx].filter((value) => /[a-z]\s/i.test(value));
  return text;
}

function files() {
  const found = [];
  for (const surface of SURFACES) {
    const dir = path.join(ROOT, surface.dir);
    if (!fs.existsSync(dir)) continue;
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.next') continue;
          walk(full);
          continue;
        }
        if (!surface.ext.includes(path.extname(entry.name))) continue;
        if (surface.only && !surface.only.includes(entry.name)) continue;
        found.push(full);
      }
    };
    walk(dir);
  }
  return found;
}

let findings = 0;
for (const file of files()) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (NOT_COPY.some((pattern) => pattern.test(line))) return;
    for (const text of visibleText(line)) {
      for (const tell of TELLS) {
        if (!tell.pattern.test(text)) continue;
        findings += 1;
        const where = path.relative(ROOT, file);
        console.log(`${where}:${index + 1}: ${tell.why}`);
        console.log(`    ${text.trim().slice(0, 120)}`);
      }
    }
  });
}

console.log('');
console.log(findings === 0 ? 'Copy: nothing to answer for.' : `Copy: ${findings} thing(s) to fix.`);
process.exit(findings === 0 ? 0 : 1);
