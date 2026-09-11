import { NextResponse } from 'next/server';

/**
 * Android App Links verification file, served at
 * /.well-known/assetlinks.json (see the rewrite in next.config.mjs).
 *
 * Point the wallet's App Link host at this site, and set:
 *   ANDROID_PACKAGE_NAME   e.g. com.smartcollege.transcript.wallet
 *   ANDROID_APP_SHA256     comma-separated SHA-256 of the signing certificate
 *
 * Get the fingerprint with:
 *   keytool -list -v -keystore <keystore> -alias <alias>
 * or, for an installed debug build:
 *   adb shell pm path <package>  →  apksigner verify --print-certs <apk>
 */

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.smartcollege.transcript.wallet';

const SHA256_FINGERPRINTS = (process.env.ANDROID_APP_SHA256 || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export function GET() {
  if (SHA256_FINGERPRINTS.length === 0) {
    return NextResponse.json(
      { error: 'ANDROID_APP_SHA256 is not configured; App Links cannot be verified.' },
      { status: 404 },
    );
  }

  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: SHA256_FINGERPRINTS,
      },
    },
  ]);
}
