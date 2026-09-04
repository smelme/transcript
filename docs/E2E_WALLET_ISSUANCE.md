# Local E2E: QR Credential Offer and Device-Bound Issuance

## Scope

This runbook verifies the complete local path:

1. An institute invites a wallet email address.
2. The wallet authenticates using the emailed OTP (returned in the issuer response only when Brevo is not configured).
3. The issuer frontend creates an issuance session and renders its OpenID4VCI offer URL as a QR code.
4. The Android wallet scans the QR code.
5. The wallet parses the offer, signs a short-lived CWT with its Android Keystore P-256 key, and sends the offer URL, authenticated access token, and CWT to the issuer.
6. The issuer validates the access-token account link, acceptance/payment gates, CWT audience, nonce, and CWT signature.
7. The issuer returns an ISO 18013-5/23220 mdoc signed for the wallet device key.

## Prerequisites

- Node.js 20 or later.
- An Android emulator with Google Play services, or a physical Android device that supports Google Code Scanner.
- Android SDK and JDK configured for the Gradle wrapper.

> Google Code Scanner provides the QR scanning UI. If Google Play services are unavailable on a test device, use the wallet's offer-URL paste field as the supported fallback.

## Start the issuer services

From the repository root, start the issuer API:

```powershell
Set-Location issuer-service
node src/index.js
```

In a second terminal, start the issuer frontend:

```powershell
Set-Location issuer-frontend
npm run dev
```

Open the issuer invitation page at `http://localhost:3002/invite`. Its API proxy routes `/api/*` to the issuer API at `http://localhost:3000`.

## Build and install the E2E wallet APK

For an Android emulator, build the debug APK with its issuer endpoint set to the emulator host alias:

```powershell
Set-Location mobile-wallet
.\gradlew.bat :app:assembleDebug -PissuerBaseUrl=http://10.0.2.2:3000
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

The debug manifest permits clear-text traffic only for the local test endpoint. For a physical device, rebuild with the workstation's LAN address rather than `10.0.2.2`, for example `-PissuerBaseUrl=http://192.168.x.x:3000`, and ensure the device can reach that address.

## Execute the journey

1. In the issuer frontend, enter an email address and student ID, then select **Send invitation**.
2. Obtain the OTP from email. If Brevo is not configured locally, use the displayed development code.
3. In the wallet, sign in using the same email address and OTP.
4. In the issuer frontend, create an issuance session using the same student ID. The offer QR code appears beneath the offer URL.
5. Accept terms and complete/confirm payment if the session requires them.
6. In the wallet, select **Receive credential**, then **Scan offer QR code** and scan the frontend QR.
7. Confirm that the credential appears in the wallet's credential list.

## Required observations

- Issuer API receives a `POST /wallet/issuance` request containing `offerUrl`, `accessToken`, and `cwt`; it must not require or accept a raw `device_key`.
- The successful response has `success: true`, `deviceBound: true`, a credential ID, and an `mdocBase64url` value.
- The issuer's credential mdoc endpoint reports both an issuer signature and value digests as valid.
- Repeating the same offer returns `409` because issuance sessions are single-use.
- A CWT with a wrong nonce, audience, or device signature is rejected.

## Automated readiness checks

```powershell
Set-Location issuer-service
node --test tests/

Set-Location ..\issuer-frontend
npx tsc --noEmit

Set-Location ..\mobile-wallet
.\gradlew.bat :app:assembleDebug -PissuerBaseUrl=http://10.0.2.2:3000

Set-Location ..
node e2e-cwt-check.mjs
```

The Node E2E script verifies invitation, OTP, token exchange, issuance-session creation, QR generation, offer parsing, CWT proof-of-possession, and return of a device-bound mdoc. It does not replace the final manual scan test on Android hardware.
