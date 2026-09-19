// OpenID for Verifiable Credential Issuance 1.0 — the issuer side.
//
// The wallet-facing issuance API, as specified by OpenID4VCI 1.0 (final, 16 September 2025),
// pre-authorized code flow, mdoc format profile:
//
//   GET  /.well-known/openid-credential-issuer   issuer metadata (endpoints, configurations, display)
//   POST /token                                  pre-authorized code -> access token
//   POST /nonce                                  c_nonce for the proof of possession
//   POST /credential                             credential request (proof + key binding) -> mdoc
//   POST /notification                           the wallet says what it did with the credential
//
// The academy's own offer URL already carries the session id as the pre-authorized code, so a
// conformant wallet can run this flow end to end without any Smart College specific endpoint. The
// bespoke /wallet/issuance path stays as it is, for the wallet builds that predate this.
//
// Two deliberate simplifications, both recorded rather than hidden:
//   * Access tokens and c_nonce values live in memory, like the mdoc sessions they accompany. A
//     restart forgets them; a wallet simply asks again.
//   * The issuer metadata is served unsigned. Signing it is optional in the specification and
//     needs a trust anchor this demo does not have.

import crypto from 'crypto';
import express from 'express';

/** The credential configuration this issuer offers. The doctype is the identifier, as is common. */
export const CREDENTIAL_CONFIGURATION_ID = 'org.iso.23220.photoid.1';

const ACCESS_TOKEN_TTL_SECONDS = 300;
const NONCE_TTL_SECONDS = 600;
const PROOF_CLOCK_SKEW_SECONDS = 600;

/**
 * What the issuer publishes about the credential it issues, including how the wallet should draw
 * it. This is the part that lets branding and claim names come from the issuer instead of being
 * hard-coded in every wallet.
 */
const DISPLAY = {
  name: 'Academic credential',
  locale: 'en',
  background_color: '#1B3A6B',
  text_color: '#FFFFFF',
};

/** The claim names a wallet shows, so a holder reads the issuer's words for its own claims. */
const CLAIM_LABELS = [
  ['given_name', 'Given name'],
  ['family_name', 'Family name'],
  ['birth_date', 'Date of birth'],
  ['issuing_authority', 'Issuing authority'],
  ['issue_date', 'Issued'],
  ['expiry_date', 'Expires'],
  ['document_number', 'Document number'],
  ['institution_name', 'Institution'],
  ['programme_title', 'Programme'],
  ['award_title', 'Award'],
  ['degree_level', 'Degree level'],
  ['field_of_study', 'Field of study'],
  ['graduation_date', 'Graduation date'],
  ['student_id', 'Student ID'],
  ['total_credits', 'Total credits'],
  ['status', 'Status'],
];

function base64UrlToJson(value) {
  return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
}

/** The issuer's identifier: the URL its metadata is published at, without a trailing slash. */
export function issuerIdentifier() {
  const configured = process.env.ISSUER_BASE_URL || 'http://localhost:3000';
  return configured.replace(/\/+$/, '');
}

/** The metadata document a wallet fetches to learn what this issuer can do. */
export function issuerMetadata() {
  const issuer = issuerIdentifier();
  return {
    credential_issuer: issuer,
    credential_endpoint: `${issuer}/credential`,
    nonce_endpoint: `${issuer}/nonce`,
    notification_endpoint: `${issuer}/notification`,
    // The issuer also acts as the authorization server, so its OAuth metadata is at the
    // conventional well-known location and the wallet need not be told separately.
    credential_configurations_supported: {
      [CREDENTIAL_CONFIGURATION_ID]: {
        format: 'mso_mdoc',
        doctype: CREDENTIAL_CONFIGURATION_ID,
        scope: CREDENTIAL_CONFIGURATION_ID,
        // The wallet proves possession of a key and the credential is bound to it. A JWK proof
        // says which key; "cose_key" is what the mdoc profile calls that binding.
        cryptographic_binding_methods_supported: ['jwk', 'cose_key'],
        credential_signing_alg_values_supported: [-7],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['ES256'] },
        },
        credential_metadata: {
          display: [DISPLAY],
          claims: CLAIM_LABELS.map(([identifier, name]) => ({
            path: [CREDENTIAL_CONFIGURATION_ID, identifier],
            display: [{ name, locale: 'en' }],
          })),
        },
      },
    },
    display: [{ name: 'Smart Academy', locale: 'en' }],
  };
}

/** The authorization server metadata: this issuer, offering the pre-authorized code grant. */
export function authorizationServerMetadata() {
  const issuer = issuerIdentifier();
  return {
    issuer,
    token_endpoint: `${issuer}/token`,
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    // A wallet that has not signed in anywhere yet can still exchange its pre-authorized code.
    pre_authorized_grant_anonymous_access_supported: true,
  };
}

/**
 * Verify a key proof: an ES256 JWT signed by the device key the credential is to be bound to.
 *
 * Every check here is one the specification requires, and each is reported specifically - a proof
 * that fails for a reason the wallet cannot see is a proof that cannot be fixed.
 */
export function verifyProofJwt(jwt, { audience, nonce, now = Date.now() }) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) {return { valid: false, error: 'proof is not a JWT' };}

  let header;
  let payload;
  try {
    header = base64UrlToJson(parts[0]);
    payload = base64UrlToJson(parts[1]);
  } catch {
    return { valid: false, error: 'proof is not readable' };
  }

  const jwk = header.jwk;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    return { valid: false, error: 'proof must carry an EC P-256 public key in its header' };
  }
  if (header.alg !== 'ES256') {
    return { valid: false, error: `unsupported proof algorithm ${header.alg}` };
  }
  if (payload.aud !== audience) {
    return { valid: false, error: 'proof audience is not this issuer' };
  }
  const age = Math.abs(now / 1000 - Number(payload.iat || 0));
  if (!Number.isFinite(age) || age > PROOF_CLOCK_SKEW_SECONDS) {
    return { valid: false, error: 'proof is not fresh' };
  }
  if (nonce && payload.nonce !== nonce) {
    return { valid: false, error: 'proof does not carry the nonce this issuer issued' };
  }

  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const verified = crypto.verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      // An ES256 JWS signature is the raw r||s pair, not the DER encoding OpenSSL defaults to.
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[2], 'base64url'),
    );
    if (!verified) {return { valid: false, error: 'proof signature does not verify' };}
  } catch (e) {
    return { valid: false, error: `proof key is unusable: ${e.message}` };
  }

  return { valid: true, devicePublicJwk: jwk };
}

/**
 * Registers the issuance endpoints on the issuer's Express app.
 *
 * State is per-registration so a test can run its own issuer without sharing tokens with another.
 */
export function registerOpenId4Vci(app, { issuer, issuerIdentifier: identifier = issuerIdentifier() } = {}) {
  const accessTokens = new Map(); // token -> { sessionId, expiresAt }
  const nonces = new Map(); // c_nonce -> { expiresAt, used }
  const notifications = new Map(); // notification_id -> { credentialId, sessionId }

  const prune = () => {
    const now = Date.now();
    for (const [token, entry] of accessTokens) {
      if (entry.expiresAt <= now) {accessTokens.delete(token);}
    }
    // A spent nonce is kept until it expires, so that a replay is told it is spent rather than
    // being treated as a nonce this issuer never issued.
    for (const [nonce, entry] of nonces) {
      if (entry.expiresAt <= now) {nonces.delete(nonce);}
    }
  };

  const bearer = (req) => {
    const header = req.headers?.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  };

  app.get('/.well-known/openid-credential-issuer', (req, res) => {
    res.json(issuerMetadata());
  });

  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json(authorizationServerMetadata());
  });

  // OAuth token requests are form-encoded, not JSON.
  app.use(express.urlencoded({ extended: false }));

  app.post('/token', (req, res) => {
    prune();
    const grantType = req.body?.grant_type;
    const code = req.body?.['pre-authorized_code'];

    if (grantType !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    if (!code) {return res.status(400).json({ error: 'invalid_request' });}

    const session = issuer.getIssuanceSession(String(code));
    if (!session) {return res.status(400).json({ error: 'invalid_grant' });}
    if (session.status === 'superseded') {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'replaced by a newer invitation' });
    }

    // The pre-authorized code is single use: a code that has been exchanged is spent, even if the
    // credential has not been collected yet. The holder asks the academy for another if needed.
    const spent = [...accessTokens.values()].some((entry) => entry.sessionId === session.sessionId);
    if (spent) {return res.status(400).json({ error: 'invalid_grant', error_description: 'code already used' });}

    const token = crypto.randomBytes(32).toString('base64url');
    accessTokens.set(token, {
      sessionId: session.sessionId,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    });
  });

  app.post('/nonce', (req, res) => {
    prune();
    const cNonce = crypto.randomBytes(16).toString('base64url');
    nonces.set(cNonce, { expiresAt: Date.now() + NONCE_TTL_SECONDS * 1000, used: false });
    res.set('Cache-Control', 'no-store');
    res.json({ c_nonce: cNonce });
  });

  app.post('/credential', (req, res) => {
    prune();
    const token = bearer(req);
    const entry = token ? accessTokens.get(token) : null;
    if (!entry) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token' });
    }

    const session = issuer.getIssuanceSession(entry.sessionId);
    if (!session) {return res.status(400).json({ error: 'invalid_token' });}

    const requestedConfiguration =
      req.body?.credential_identifier || req.body?.credential_configuration_id;
    if (requestedConfiguration && requestedConfiguration !== CREDENTIAL_CONFIGURATION_ID) {
      return res.status(400).json({ error: 'unknown_credential_configuration' });
    }

    // The proof is how the wallet proves it holds the key the credential will be bound to.
    const proofs = req.body?.proofs;
    const jwtProofs = Array.isArray(proofs?.jwt) ? proofs.jwt : [];
    if (!jwtProofs.length) {return res.status(400).json({ error: 'invalid_proof' });}

    // This issuer has a nonce endpoint, so a credential request must carry one of its nonces, and
    // a nonce is spent by the request it appears in.
    const suppliedNonce = (() => {
      try {return base64UrlToJson(String(jwtProofs[0]).split('.')[1]).nonce;} catch {return undefined;}
    })();
    if (!suppliedNonce) {
      return res.status(400).json({
        error: 'invalid_proof',
        error_description: 'this issuer requires a c_nonce from /nonce',
      });
    }
    const nonceEntry = nonces.get(String(suppliedNonce));
    if (!nonceEntry) {return res.status(400).json({ error: 'invalid_nonce' });}
    if (nonceEntry.used) {return res.status(400).json({ error: 'invalid_nonce' });}

    const proof = verifyProofJwt(jwtProofs[0], {
      audience: identifier,
      nonce: String(suppliedNonce),
    });
    if (!proof.valid) {
      return res.status(400).json({ error: 'invalid_proof', error_description: proof.error });
    }
    nonceEntry.used = true;

    // Claiming again with the same access token is explicitly allowed: the issuer may return an
    // updated credential, and must not revoke the earlier one as a side effect.
    const result = issuer.issueForSession(session, proof.devicePublicJwk, { allowReissue: true });
    if (!result.success) {
      return res.status(400).json({ error: 'credential_request_denied', error_description: result.error });
    }

    const notificationId = crypto.randomUUID();
    notifications.set(notificationId, {
      credentialId: result.credentialId,
      sessionId: session.sessionId,
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      credentials: [{ credential: result.mdocBase64url }],
      notification_id: notificationId,
    });
  });

  app.post('/notification', (req, res) => {
    const token = bearer(req);
    if (!token || !accessTokens.has(token)) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { notification_id: notificationId, event } = req.body || {};
    const record = notifications.get(String(notificationId));
    if (!record) {return res.status(400).json({ error: 'invalid_notification_id' });}
    if (!['credential_accepted', 'credential_failure', 'credential_deleted'].includes(event)) {
      return res.status(400).json({ error: 'invalid_notification_request' });
    }

    // The point of the notification endpoint: the issuer learns what happened to the credential it
    // issued, instead of inferring it from the session's status.
    issuer.auditLog?.push({
      timestamp: new Date().toISOString(),
      action: `credential_${event.replace('credential_', '')}`,
      credentialId: record.credentialId,
      credentialType: 'PhotoID',
      details: { notificationId, event, sessionId: record.sessionId },
    });

    res.status(204).end();
  });

  return { accessTokens, nonces, notifications };
}
