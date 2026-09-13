/**
 * Minimal dependency-free PDF generator for shared credential documents.
 *
 * Produces a single-page PDF with a title and label/value rows using the
 * built-in Helvetica Type1 font (always available in PDF readers). Values are
 * escaped and wrapped so arbitrary claim text renders safely.
 */

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

/**
 * @param {{ title: string, subtitle?: string, rows: Array<[string, string]>, footer?: string }} doc
 * @returns {Buffer} a valid single-page PDF
 */
export function renderSharePdf({ title, subtitle, rows, footer }) {
  const content = [];
  const startY = 720;
  const margin = 72;
  const maxCharsPerLine = 95;

  const wrap = (text) => {
    const chunks = [];
    for (const line of String(text ?? '').split('\n')) {
      if (line.length <= maxCharsPerLine) {
        chunks.push(line);
      } else {
        let rest = line;
        while (rest.length > maxCharsPerLine) {
          chunks.push(rest.slice(0, maxCharsPerLine));
          rest = rest.slice(maxCharsPerLine);
        }
        if (rest) {chunks.push(rest);}
      }
    }
    return chunks;
  };

  let y = startY;
  const emit = (str, size, gapAfter = 6) => {
    for (const line of wrap(str)) {
      content.push(`BT /F1 ${size} Tf ${margin} ${y} Td (${escapePdfText(line)}) Tj ET`);
      y -= size + gapAfter;
    }
    return y;
  };

  y = emit(title || 'Shared document', 20, 8);
  if (subtitle) {y = emit(subtitle, 11, 14);}
  y -= 6;

  for (const [label, value] of rows) {
    y = emit(`${label}: ${value || '—'}`, 11, 6);
    y -= 2;
  }

  if (footer) {
    y -= 12;
    emit(footer, 9, 0);
  }

  const stream = content.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}
