# Building the wallet APK

The wallet is not part of the web deployment. It is an Android app that has to be built against
whichever issuer it will talk to, because both the issuer address and the App Link host are baked
into it at build time. A build pointed at a local address works on this machine and nowhere else.

## The two properties that matter

| Property | What it does | Current deployment |
| --- | --- | --- |
| `issuerBaseUrl` | the issuer the wallet claims credentials from | `https://issuer-production-335e.up.railway.app` |
| `walletAppLinkHost` | the host whose offer links open the wallet directly | `academy-production-8262.up.railway.app` |

Left out, they default to `https://issuer.smartcollege.example` and `applink.invalid`, which is a
deliberately inert pair rather than something that half works.

## Building

From `mobile-wallet`:

```
.\gradlew.bat assembleDebug `
  -PissuerBaseUrl=https://issuer-production-335e.up.railway.app `
  -PwalletAppLinkHost=academy-production-8262.up.railway.app
```

The result is `app\build\outputs\apk\debug\app-debug.apk`.

**Pass the properties as separate arguments, not inline in one string.** PowerShell splits a bare
`-PissuerBaseUrl=https://...` and Gradle then reads the tail of the URL as a task name, failing with
something like `Task '.up.railway.app' not found`. An argument array avoids it:

```powershell
$gradleArgs = @(
  'assembleDebug',
  '-PissuerBaseUrl=https://issuer-production-335e.up.railway.app',
  '-PwalletAppLinkHost=academy-production-8262.up.railway.app'
)
& '.\gradlew.bat' @gradleArgs
```

## Installing

```
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

For a phone that is not connected to this machine, send the APK over and open it. Android will ask
for permission to install from that source.

## Which signature, and why it matters twice

A debug build is signed with the debug keystore on the machine that built it. That is enough to
install and to run, and the fingerprint currently trusted by
`/.well-known/assetlinks.json` is exactly that debug certificate, so App Links work on a debug build.

Two consequences worth knowing before this is handed to anyone else:

- A different machine's debug keystore produces a **different** certificate, so an APK built
  elsewhere needs its fingerprint added before its links open the wallet.
- A release build needs its own keystore. The release fingerprint goes in the same variable as the
  debug one, comma separated, and both then work at once.

There is no release signing configuration in the project yet, so `assembleRelease` produces an
unsigned APK that no device will install. Wiring it means a keystore you keep for the life of the
app, plus a signing entry in `app/build.gradle.kts` that reads its path and passwords from build
properties rather than from the repository. Do that before Firebase or any wider distribution,
because the certificate a device trusts cannot be changed afterwards without reinstalling.

iOS is not built here. The repository carries a Swift bridge, but nothing in this deployment uses it.

## Firebase App Distribution, when the time comes

Nothing in this repository depends on Firebase today, and the app does not need to be built with a
Firebase SDK to be distributed: App Distribution takes a finished APK, not an integration. What it
needs is an APK, the Firebase app id, and the tester list. Two notes for when that moment arrives:

- Tester devices install a release-signed APK by convention. Signing the release build is therefore
  the first step, not the last.
- The App Link fingerprint still has to name whichever certificate is on the installed device, so
  adding a release keystore means updating `ANDROID_APP_SHA256` on the academy service as well.
