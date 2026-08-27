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
./gradlew :mobile-wallet:assembleDebug

# Build for iOS
./gradlew :mobile-wallet:build -Pkotlin.targets=ios
```

## Development

See main repository README and system plan for full context.

## File Structure

```
mobile-wallet/
├── src/
│   ├── commonMain/      # Shared code (iOS + Android)
│   ├── androidMain/     # Android-specific code
│   └── iosMain/         # iOS-specific code
├── build.gradle.kts
└── README.md            # This file
```
