import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as cbor2 from 'cbor2';

/**
 * Reader (verifier) authentication for ISO 18013-7 mdoc requests.
 *
 * A verifier that authenticates its request lets the wallet show *who* is
 * asking for the holder's data, instead of presenting an anonymous prompt.
 * The signature covers the reader authentication structure:
 *
 *   ReaderAuthentication = [
 *     "ReaderAuthentication",
 *     SessionTranscript,          ; binds the request to this one-time session
 *     ItemsRequestBytes           ; exactly the request being authorised
 *   ]
 *   ReaderAuthenticationBytes = #6.24(CBOR(ReaderAuthentication))
 *   Sig_structure = ["Signature1", protected, external_aad, ReaderAuthenticationBytes]
 *
 * Without a certificate authority the reader presents a stable key id (`kid`)
 * instead of an x5chain; verifiers publish their public key at
 * GET /presentation/reader-key so wallets can pin it out of band.
 */

const RFC7638_THUMBPRINT_SHA256 = 'sha256';

/** Stable, deterministic key id: RFC 7638 JWK thumbprint. */
export function jwkThumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return crypto.createHash('sha256').update(canonical).digest('base64url');
}

export class ReaderAuthService {
  constructor({ dataDir, kidPrefix = 'quals-verifier' } = {}) {
    this.dataDir = dataDir || path.resolve(process.cwd(), 'data');
    this.kidPrefix = kidPrefix;
    this.keyFile = path.join(this.dataDir, 'reader-key.json');
    this.jwk = null;
    this.loaded = this._loadOrCreate();
  }

  /** Synchronously load the persisted reader key, creating one on first run. */
  _loadOrCreate() {
    try {
      if (fs.existsSync(this.keyFile)) {
        const stored = JSON.parse(fs.readFileSync(this.keyFile, 'utf8'));
        if (stored?.kty === 'EC' && stored.crv === 'P-256' && stored.d) {
          this.jwk = stored;
          return Promise.resolve(false);
        }
      }
    } catch (e) {
      console.error('[reader-auth] could not read the stored reader key:', e.message);
    }

    return (async () => {
      const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );
      this.jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
      try {
        fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
        fs.writeFileSync(this.keyFile, JSON.stringify(this.jwk, null, 2), { mode: 0o600 });
        console.log(`[reader-auth] created a reader key at ${this.keyFile}`);
      } catch (e) {
        console.error('[reader-auth] could not persist the reader key:', e.message);
      }
      return true;
    })();
  }

  /** Wait until the key material is ready, then return the public JWK. */
  async publicJwk() {
    await this.loaded;
    return { kty: this.jwk.kty, crv: this.jwk.crv, x: this.jwk.x, y: this.jwk.y };
  }

  async kid() {
    await this.loaded;
    return `${this.kidPrefix}:${jwkThumbprint(this.jwk)}`;
  }

  /** Public description of the reader, for wallets to pin. */
  async describe() {
    const [jwk, kid] = await Promise.all([this.publicJwk(), this.kid()]);
    return { kid, jwk, algorithm: 'ES256', thumbprintMethod: RFC7638_THUMBPRINT_SHA256 };
  }

  /**
   * Produce the `readerAuthAll` array for a DeviceRequest.
   *
   * @param {{ sessionTranscriptBytes: Uint8Array, itemsRequestBytes: Uint8Array }} input
   * @returns {Promise<Array>} COSE_Sign1 structures, ready for CBOR encoding.
   */
  async createReaderAuth({ sessionTranscriptBytes, itemsRequestBytes }) {
    await this.loaded;

    const readerAuthentication = [
      'ReaderAuthentication',
      new Uint8Array(sessionTranscriptBytes),
      new Uint8Array(itemsRequestBytes),
    ];
    const readerAuthenticationBytes = new Uint8Array(
      cbor2EncodeTag24(cbor2Encode(readerAuthentication)),
    );

    const protectedHeader = new Uint8Array(cbor2Encode({ 1: -7 })); // alg: ES256
    const sigStructure = new Uint8Array(
      cbor2Encode([
        'Signature1',
        protectedHeader,
        new Uint8Array(0),
        readerAuthenticationBytes,
      ]),
    );

    const key = await crypto.subtle.importKey(
      'jwk',
      this.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    // WebCrypto returns the IEEE P1363 r||s form required by COSE.
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigStructure),
    );

    const unprotectedHeader = { 4: await this.kid() }; // 4 = kid

    return [
      [
        protectedHeader,
        unprotectedHeader,
        readerAuthenticationBytes,
        signature,
      ],
    ];
  }
}

// cbor2 helpers.

function cbor2Encode(value) {
  return cbor2.encode(value);
}

/** Wrap encoded bytes in CBOR tag 24 (#6.24) without re-encoding the content. */
function cbor2EncodeTag24(encodedBytes) {
  return cbor2.encode(new cbor2.Tag(24, encodedBytes));
}

export default ReaderAuthService;
