#!/usr/bin/env node

/**
 * Full CBOR decoder to analyze the working mDL mDOC structure
 * ISO 18013-5 mdoc format
 */

import fs from 'fs';

// Working mDL from Paradym debugger (valid)
const workingMdl = fs.readFileSync('mdoc-structure-analysis.txt', 'utf8')
  .match(/Raw CBOR Hex:\n([0-9a-f]+)/i)?.[1];

// Reconstruct from the known working sample string
const workingMdlB64 = `uQACam5hbWVTcGFjZXOhcW9yZi5pc28uMTgwMTMuNS4xjdgYWGSkaGRpZ2VzdElEAHFlbGVtZW50SWRlbnRpZmllcmpnaXZlbl9uYW1lbGVsZW1lbnRWYWx1ZWVFcmlrYWZyYW5kb21YIJnkCu7S4odZz8BNiXY24ePOfpoaFAW7RjxnFlPqmLhP2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckL`;

// Just decode the full base64url from the file if available, else use inline
let fullB64url = workingMdlB64;
try {
  const txt = fs.readFileSync('mdoc-structure-analysis.txt', 'utf8');
  const m = txt.match(/Base64URL Length: (\d+)/);
  if (m) console.log('Found analysis file, length:', m[1]);
} catch (e) {
  // no file
}

// We'll re-embed the FULL working sample for complete decode
const FULL_WORKING_MDL = `uQACam5hbWVTcGFjZXOhcW9yZi5pc28uMTgwMTMuNS4xjdgYWGSkaGRpZ2VzdElEAHFlbGVtZW50SWRlbnRpZmllcmpnaXZlbl9uYW1lbGVsZW1lbnRWYWx1ZWVFcmlrYWZyYW5kb21YIJnkCu7S4odZz8BNiXY24ePOfpoaFAW7RjxnFlPqmLhP2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckL`;

// Use full sample from summary (reconstruct)
// Actually decode the exact sample user gave in summary
const sample = `uQACam5hbWVTcGFjZXOhcW9yZi5pc28uMTgwMTMuNS4xjdgYWGSkaGRpZ2VzdElEAHFlbGVtZW50SWRlbnRpZmllcmpnaXZlbl9uYW1lbGVsZW1lbnRWYWx1ZWVFcmlrYWZyYW5kb21YIJnkCu7S4odZz8BNiXY24ePOfpoaFAW7RjxnFlPqmLhP2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAljZWxlbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckL`;

class CBORDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  peek() {
    return this.buffer[this.offset];
  }

  readByte() {
    if (this.offset >= this.buffer.length) throw new Error('Unexpected end of buffer');
    return this.buffer[this.offset++];
  }

  readLength(major, ai) {
    if (ai < 24) return ai;
    if (ai === 24) return this.readByte();
    if (ai === 25) {
      const b1 = this.readByte(), b2 = this.readByte();
      return (b1 << 8) | b2;
    }
    if (ai === 26) {
      const b1 = this.readByte(), b2 = this.readByte(), b3 = this.readByte(), b4 = this.readByte();
      return ((b1 << 24) | (b2 << 16) | (b3 << 8) | b4) >>> 0;
    }
    if (ai === 27) {
      let val = 0n;
      for (let i = 0; i < 8; i++) val = (val << 8n) | BigInt(this.readByte());
      return val;
    }
    throw new Error(`Unsupported length ai=${ai}`);
  }

  decode() {
    const byte = this.readByte();
    const major = byte >> 5;
    const ai = byte & 0x1f;

    switch (major) {
      case 0: return this.readLength(major, ai); // unsigned int
      case 1: return -1n - BigInt(this.readLength(major, ai)); // negative int
      case 2: { // byte string
        const len = Number(this.readLength(major, ai));
        const start = this.offset;
        this.offset += len;
        return { __type: 'bytes', value: this.buffer.slice(start, this.offset).toString('hex'), length: len };
      }
      case 3: { // text string
        const len = Number(this.readLength(major, ai));
        const start = this.offset;
        this.offset += len;
        return this.buffer.slice(start, this.offset).toString('utf8');
      }
      case 4: { // array
        const len = Number(this.readLength(major, ai));
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.decode());
        return arr;
      }
      case 5: { // map
        const len = Number(this.readLength(major, ai));
        const map = {};
        for (let i = 0; i < len; i++) {
          const key = this.decode();
          const value = this.decode();
          map[typeof key === 'object' ? JSON.stringify(key) : key] = value;
        }
        return map;
      }
      case 6: { // tag
        const tag = this.readLength(major, ai);
        const value = this.decode();
        return { __tag: tag, value };
      }
      case 7: { // simple/float
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22 || ai === 23) return null;
        if (ai === 26) {
          const b = this.buffer.slice(this.offset, this.offset + 4);
          this.offset += 4;
          return { __type: 'float32', value: b.toString('hex') };
        }
        if (ai === 27) {
          const b = this.buffer.slice(this.offset, this.offset + 8);
          this.offset += 8;
          return { __type: 'float64', value: b.toString('hex') };
        }
        return { __type: 'simple', value: ai };
      }
      default:
        throw new Error(`Unsupported major type ${major}`);
    }
  }
}

// Decode
const b64 = sample.replace(/-/g, '+').replace(/_/g, '/');
const padding = '='.repeat((4 - b64.length % 4) % 4);
const buffer = Buffer.from(b64 + padding, 'base64');

console.log('Full decoded size:', buffer.length, 'bytes\n');

const decoder = new CBORDecoder(buffer);
const result = decoder.decode();

// Pretty print
function summarize(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return `${pad}null`;
  if (typeof value === 'string') return `${pad}"${value.length > 80 ? value.slice(0, 80) + '...' : value}"`;
  if (typeof value === 'boolean') return `${pad}${value}`;
  if (typeof value === 'bigint') return `${pad}${value}n`;
  if (typeof value === 'number') return `${pad}${value}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return `${pad}[\n${value.map(v => summarize(v, indent + 1)).join(',\n')}\n${pad}]`;
  }
  if (typeof value === 'object') {
    if (value.__type === 'bytes') return `${pad}<bytes ${value.length}>`;
    if (value.__tag !== undefined) return `${pad}<tag ${value.__tag}>\n${summarize(value.value, indent + 1)}`;
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}{}`;
    return `${pad}{\n${keys.map(k => `${'  '.repeat(indent + 1)}"${k}": ${summarize(value[k], indent + 1).trimStart()}`).join(',\n')}\n${pad}}`;
  }
  return `${pad}${String(value)}`;
}

console.log('STRUCTURE:');
console.log(summarize(result));

// Also print top-level keys
if (typeof result === 'object' && !Array.isArray(result) && result.__tag === undefined) {
  console.log('\nTop-level keys:', Object.keys(result));
}
