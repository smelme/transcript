# Mobile Wallet

Native mobile app for iOS and Android to store and share academic credentials.

## Overview

The Mobile Wallet provides:
- QR code scanner for credential reception
- Encrypted local credential storage
- Biometric/PIN authentication
- Credential display and management
- QR presentation mode for sharing
- Selective disclosure (choose fields to share)
- Audit log of credential shares

## Tech Stack

- Kotlin Multiplatform Mobile
- iOS (via Kotlin/Native + Swift)
- Android (via Kotlin)
- Encrypted device storage (Keystore/Keychain)
- Native camera QR scanner

## Quick Start

```bash
# Build for Android
./gradlew assembleDebug
```

Two values are baked into the app when it is built, so a build meant for the deployed system has to
name that system:

```powershell
$gradleArgs = @(
  'assembleDebug',
  '-PissuerBaseUrl=https://issuer-production-335e.up.railway.app',
  '-PwalletAppLinkHost=academy-production-8262.up.railway.app'
)
& '.\gradlew.bat' @gradleArgs
```

Left out, they fall back to an inert placeholder pair, which is why an app built without them cannot
reach anything. `docs/distribution.md` covers the properties, the resulting APK, and what signing it
means for App Links and for distributing it later.

## Development

See main repository README and system plan for full context.

## File Structure

```
mobile-wallet/
├── app/
│   ├── src/main/        # the application, Kotlin and Compose
│   ├── src/test/        # the data layer tests, which run without a device
│   └── build.gradle.kts # where the two build properties are read
├── docs/                # UI development notes and distribution notes
└── settings.gradle.kts
```
