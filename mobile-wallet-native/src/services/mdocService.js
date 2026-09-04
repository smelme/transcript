// mdocService — parse, verify, and display ISO 18013-5 IssuerSigned mdocs
// in the mobile wallet. Backed by the shared mdoc-core library so the wallet
// understands the exact same credential format as the issuer and verifier.
//
// Note: in a real React Native runtime, Node's `crypto` module is not built in;
// a native crypto bridge (e.g. react-native-quick-crypto) should be provided.
// The parsing helpers (decodeCbor/toFriendly) are pure JS and work anywhere.

import { parseMdoc, verifyIssuerSigned } from '../../../mdoc-core.js';

function friendlyValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v && v.type === 'date') return v.value;
  if (v && v.type === 'bytes') return { base64: v.base64, length: v.length };
  if (Array.isArray(v)) return v.map(friendlyValue);
  if (typeof v === 'object') return v;
  return v;
}

function findField(parsed, identifier) {
  for (const ns of Object.values(parsed.namespaces || {})) {
    for (const item of ns) {
      if (item.elementIdentifier === identifier) return friendlyValue(item.elementValue);
    }
  }
  return null;
}

/**
 * Parse an ISO 18013-5 IssuerSigned mdoc (base64url) into a display-friendly
 * summary the wallet UI can render.
 */
export function decodeMdoc(mdocBase64url) {
  return parseMdoc(mdocBase64url);
}

/**
 * Cryptographically verify an mdoc signature and per-field digests.
 */
export function verifyMdoc(mdocBase64url) {
  return verifyIssuerSigned(mdocBase64url);
}

/**
 * Flatten a parsed mdoc into a wallet credential summary.
 */
export function mdocToCredentialSummary(mdocBase64url) {
  const parsed = parseMdoc(mdocBase64url);
  const fields = {};
  for (const ns of Object.values(parsed.namespaces || {})) {
    for (const item of ns) {
      fields[item.elementIdentifier] = friendlyValue(item.elementValue);
    }
  }

  return {
    docType: parsed.docType,
    issuer: findField(parsed, 'issuing_authority') || parsed.issuerCert?.subject || 'Unknown',
    givenName: findField(parsed, 'given_name'),
    familyName: findField(parsed, 'family_name'),
    documentNumber: findField(parsed, 'document_number'),
    birthDate: findField(parsed, 'birth_date'),
    issueDate: findField(parsed, 'issue_date'),
    expiryDate: findField(parsed, 'expiry_date'),
    fields,
    validityInfo: parsed.validityInfo,
    issuerCert: parsed.issuerCert,
    signatureValid: parsed.signatureValid,
    digestsValid: parsed.digestsValid,
    error: parsed.error || undefined,
  };
}
