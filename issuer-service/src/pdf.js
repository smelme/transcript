/**
 * A small, dependency-free PDF writer for shared credential documents.
 *
 * It lays out a document built by share-document.js: a masthead, a title, sections of label and
 * value rows, a module table that may run over more than one page, and a footer naming the share on
 * every page. Nothing here knows about credentials, so any document of this shape can be rendered.
 *
 * Two limits are deliberate. Text is written as WinAnsi, which is what the built-in Helvetica
 * reads, so a character outside it becomes `?` rather than an unreadable byte pair; and line breaks
 * come from an approximate Helvetica width with a margin, because a line that lands a little short
 * is invisible while a line that overflows is not.
 */

const PAGE = { width: 612, height: 792, margin: 56 };
const FOOTER_BAND = 62;
const LABEL_COLUMN = 148;

const COLORS = {
  ink: [0.078, 0.086, 0.11],
  muted: [0.42, 0.42, 0.42],
  faint: [0.62, 0.62, 0.62],
  gold: [1, 0.769, 0],
  green: [0.106, 0.612, 0.357],
  rule: [0.9, 0.874, 0.79],
  wash: [0.976, 0.973, 0.957],
};

/** Helvetica advance widths, in 1/1000 em, as published for the Type1 font. */
const WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, '{': 334,
  '|': 260, '}': 334, '~': 584,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556,
  M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500,
};

/** Characters the document may contain that WinAnsi places above ASCII. */
const WIN_ANSI = new Map([
  ['\u2014', 0x97],
  ['\u2013', 0x96],
  ['\u2018', 0x91],
  ['\u2019', 0x92],
  ['\u201c', 0x93],
  ['\u201d', 0x94],
  ['\u00b7', 0xb7],
  ['\u2026', 0x85],
]);

function encodeText(value) {
  let out = '';
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0);
    if (code < 0x80) {out += char;}
    else if (WIN_ANSI.has(char)) {out += String.fromCharCode(WIN_ANSI.get(char));}
    else {out += '?';}
  }
  return out;
}

function escapeText(value) {
  return encodeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Bold is a little wider than regular, so the regular table is scaled rather than measured twice. */
function widthOf(text, size, bold) {
  let total = 0;
  for (const char of String(text ?? '')) {
    total += WIDTHS[char] ?? 556;
  }
  return (total / 1000) * size * (bold ? 1.06 : 1);
}

/** Breaks a single line that is too long for its column, preferring a space or a hyphen. */
function wrapLine(line, size, bold, maxWidth) {
  const pieces = [];
  let rest = String(line ?? '');
  while (rest.length && widthOf(rest, size, bold) > maxWidth) {
    let cut = rest.length;
    while (cut > 1 && widthOf(rest.slice(0, cut), size, bold) > maxWidth) {
      cut -= 1;
    }
    const breakAt = rest.slice(0, cut).search(/[ \t][^ \t]*$/);
    const slice = breakAt > 0 ? rest.slice(0, breakAt) : rest.slice(0, Math.max(cut, 1));
    pieces.push(slice.trimEnd());
    rest = rest.slice(slice.length).trimStart();
  }
  pieces.push(rest);
  return pieces;
}

function wrap(text, size, bold, maxWidth) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (paragraph === '') {lines.push('');}
    else {lines.push(...wrapLine(paragraph, size, bold, maxWidth));}
  }
  return lines;
}

/**
 * Lays the document out into page content streams, then writes the file. Pages are built before
 * anything is serialised, so a footer can say how many there are.
 */
class Writer {
  constructor() {
    this.pages = [];
    this.ops = null;
    this.y = 0;
  }

  /** The usable width of the page. */
  get contentWidth() {
    return PAGE.width - PAGE.margin * 2;
  }

  get bottom() {
    return PAGE.margin + FOOTER_BAND;
  }

  startPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Room for the next block, or a new page. Never leaves a heading stranded at the foot. */
  need(height) {
    if (this.y - height < this.bottom) {this.startPage();}
  }

  space(height) {
    this.y -= height;
  }

  move(x, y) {
    this.ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
  }

  colour(rgb, stroke) {
    const [r, g, b] = rgb;
    this.ops.push(`${r} ${g} ${b} ${stroke ? 'RG' : 'rg'}`);
  }

  text(value, { x = PAGE.margin, size = 10, bold = false, colour = COLORS.ink } = {}) {
    this.colour(colour);
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${this.y.toFixed(2)} Tm`);
    this.ops.push(`(${escapeText(value)}) Tj`);
    this.ops.push('ET');
  }

  rightText(value, { x = PAGE.width - PAGE.margin, size = 10, bold = false, colour = COLORS.ink } = {}) {
    this.text(value, { x: x - widthOf(value, size, bold), size, bold, colour });
  }

  /** Writes wrapped text and returns the height it used. */
  paragraph(value, { x = PAGE.margin, size = 10, bold = false, colour = COLORS.ink, width, leading = 1.35 } = {}) {
    const maxWidth = width ?? this.contentWidth;
    const lineHeight = size * leading;
    const lines = wrap(value, size, bold, maxWidth);
    for (const line of lines) {
      this.need(lineHeight);
      this.text(line, { x, size, bold, colour });
      this.y -= lineHeight;
    }
    return lines.length * lineHeight;
  }

  rule({ x = PAGE.margin, width = this.contentWidth, colour = COLORS.rule, weight = 0.7 } = {}) {
    this.colour(colour, true);
    this.ops.push(`${weight} w ${x} ${this.y.toFixed(2)} m ${(x + width).toFixed(2)} ${this.y.toFixed(2)} l S`);
  }

  fillRect(x, y, width, height, colour) {
    this.colour(colour);
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }
}

/**
 * The masthead. The mark is drawn rather than embedded: it is the same gold and green square the
 * portal uses, so nothing has to be fetched or trusted at render time.
 */
function drawMasthead(writer, doc) {
  const top = writer.y;
  const size = 30;
  writer.fillRect(PAGE.margin, top - size, size, size * 0.66, COLORS.gold);
  writer.fillRect(PAGE.margin, top - size, size, size * 0.34, COLORS.green);
  writer.text('Q', { x: PAGE.margin + 9.5, size: 17, bold: true, colour: COLORS.ink });

  writer.y = top;
  writer.text('Quals', { x: PAGE.margin + size + 10, size: 15, bold: true });
  writer.y -= 13;
  writer.text('Verifiable credentials', { x: PAGE.margin + size + 10, size: 8.5, colour: COLORS.faint });

  writer.y = top;
  if (doc.kindLabel) {
    writer.rightText(doc.kindLabel, { size: 9, bold: true, colour: COLORS.muted });
  }
  writer.y -= 13;
  if (doc.share?.sharedOn) {
    writer.rightText(`Shared ${doc.share.sharedOn}`, { size: 8.5, colour: COLORS.faint });
  }

  writer.y = top - size - 14;
  writer.rule();
  writer.space(20);
}

/** A section heading with the rule that ties it to its rows. */
function drawSectionHeading(writer, heading) {
  writer.need(46);
  writer.text(heading, { size: 11, bold: true });
  writer.y -= 7;
  writer.rule({ colour: COLORS.rule });
  writer.space(12);
}

function drawRows(writer, rows) {
  const valueX = PAGE.margin + LABEL_COLUMN;
  const valueWidth = writer.contentWidth - LABEL_COLUMN;
  for (const [label, value] of rows) {
    const lines = wrap(value, 10, false, valueWidth);
    const height = Math.max(lines.length * 13.5, 13.5);
    writer.need(height + 6);
    const startY = writer.y;
    writer.y = startY;
    writer.text(label, { size: 9.5, colour: COLORS.muted });
    writer.y = startY;
    for (const line of lines) {
      writer.text(line, { x: valueX, size: 10 });
      writer.y -= 13.5;
    }
    writer.space(4);
  }
}

/** The module table, with its heading row repeated wherever it continues onto a new page. */
function drawTable(writer, table) {
  const weights = table.columns.map((heading) => {
    const key = heading.toLowerCase();
    if (key === 'title') {return 2.4;}
    if (key === 'module') {return 1.5;}
    if (key === 'term') {return 1.0;}
    if (key === 'credits') {return 0.7;}
    return 0.9;
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const widths = weights.map((w) => (w / totalWeight) * writer.contentWidth);
  const pad = 4;

  const header = () => {
    writer.need(30);
    writer.colour(COLORS.muted);
    let x = PAGE.margin;
    for (let i = 0; i < table.columns.length; i += 1) {
      writer.y = headerY;
      writer.text(table.columns[i], { x, size: 8, bold: true, colour: COLORS.muted });
      x += widths[i];
    }
    writer.y = headerY - 5;
    writer.rule({ colour: COLORS.rule });
    writer.y = headerY - 5;
    writer.space(11);
  };

  if (table.caption) {
    writer.need(20);
    writer.text(table.caption, { size: 9, colour: COLORS.muted });
    writer.space(10);
  }

  let headerY = writer.y;
  header();

  for (const row of table.rows) {
    const cells = row.map((value, i) => wrap(value, 9.5, false, widths[i] - pad * 2));
    const height = Math.max(...cells.map((lines) => lines.length)) * 12.5;
    if (writer.y - height < writer.bottom) {
      writer.startPage();
      headerY = writer.y;
      header();
    }
    const rowTop = writer.y;
    let x = PAGE.margin;
    for (let i = 0; i < cells.length; i += 1) {
      writer.y = rowTop;
      for (const line of cells[i]) {
        writer.text(line, { x, size: 9.5 });
        writer.y -= 12.5;
      }
      x += widths[i];
    }
    writer.y = rowTop - height;
    writer.space(2);
    writer.rule({ colour: COLORS.wash });
    writer.space(6);
  }
  writer.space(8);
}

function drawShareDetails(writer, doc) {
  const share = doc.share || {};
  drawSectionHeading(writer, 'About this share');

  const rows = [
    ['Shared by', share.sharedBy],
    ['Shared with', share.sharedWith],
    ['Shared on', share.sharedOn],
    ['Access until', share.accessUntil],
    ['Sections released', (share.disclosedSections || []).join(', ') || 'Not recorded'],
    ['Reference', share.reference],
  ].filter(([, value]) => value);

  drawRows(writer, rows);

  if (share.message) {
    const height = wrap(share.message, 10, false, writer.contentWidth - 24).length * 13.5 + 16;
    writer.need(height + 8);
    const top = writer.y;
    writer.fillRect(PAGE.margin, top - height, writer.contentWidth, height, COLORS.wash);
    writer.y = top - 8;
    writer.paragraph(share.message, { x: PAGE.margin + 12, size: 10, width: writer.contentWidth - 24 });
    writer.y = top - height;
    writer.space(12);
  }

  drawSectionHeading(writer, 'What Quals checked');
  for (const check of share.checks || []) {
    writer.need(16);
    writer.text('-', { size: 10, colour: COLORS.muted });
    writer.paragraph(check, { x: PAGE.margin + 12, size: 10, width: writer.contentWidth - 12, colour: COLORS.muted });
    writer.space(3);
  }
}

/** Section 12 of the PDF specification, in the order a reader's viewer expects to find it. */
function drawFooters(writer, doc) {
  const total = writer.pages.length;
  writer.pages.forEach((ops, index) => {
    const keepOps = writer.ops;
    writer.ops = ops;
    const keepY = writer.y;
    writer.y = PAGE.margin - 12;
    writer.rule({ colour: COLORS.rule });
    writer.y = PAGE.margin - 24;
    writer.text('Quals verifiable credentials', { size: 8, colour: COLORS.faint });
    if (doc.share?.reference) {
      writer.text(`Share ${doc.share.reference}`, { x: PAGE.margin + 150, size: 8, colour: COLORS.faint });
    }
    writer.rightText(`Page ${index + 1} of ${total}`, { size: 8, colour: COLORS.faint });
    writer.y = keepY;
    writer.ops = keepOps;
  });
}

/**
 * @param {object} doc a document built by share-document.js
 * @returns {Buffer} a valid PDF
 */
export function renderSharePdf(doc) {
  const writer = new Writer();
  writer.startPage();

  drawMasthead(writer, doc);

  const title = doc.title || 'Shared credential';
  writer.need(34);
  writer.text(title, { size: 20, bold: true });
  writer.space(24);
  if (doc.subtitle) {
    writer.text(doc.subtitle, { size: 11, colour: COLORS.muted });
    writer.space(20);
  }
  if (doc.lede) {
    writer.paragraph(doc.lede, { size: 10, colour: COLORS.muted });
    writer.space(14);
  }

  for (const section of doc.sections || []) {
    if (!section.rows?.length) {continue;}
    drawSectionHeading(writer, section.heading);
    drawRows(writer, section.rows);
    writer.space(10);
  }

  if (doc.courses?.rows?.length) {
    drawSectionHeading(writer, 'Modules');
    drawTable(writer, doc.courses);
  }

  drawShareDetails(writer, doc);

  if (doc.provenance) {
    writer.need(30);
    writer.rule({ colour: COLORS.rule });
    writer.space(12);
    writer.paragraph(doc.provenance, { size: 8.5, colour: COLORS.faint });
  }

  drawFooters(writer, doc);

  const pageCount = writer.pages.length;
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  for (let i = 0; i < pageCount; i += 1) {
    pageObjectNumbers.push(5 + i);
    contentObjectNumbers.push(5 + pageCount + i);
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  for (let i = 0; i < pageCount; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumbers[i]} 0 R >>`,
    );
  }
  for (const ops of writer.pages) {
    const stream = ops.join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push(
    `<< /Title (${escapeText(title)}) /Author (Quals) /Creator (Quals) ` +
      `/Subject (${escapeText(doc.kindLabel || 'Shared credential')}) >>`,
  );
  const infoNumber = objects.length;

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNumber} 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  // latin1 because every character was mapped into WinAnsi above, which makes the byte offset in
  // the cross-reference table the same as the string index used to compute it.
  return Buffer.from(pdf, 'latin1');
}

export default renderSharePdf;
