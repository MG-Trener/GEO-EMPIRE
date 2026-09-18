# Android prototype signing

`geo-empire-prototype-debug.keystore.b64` is a stable **debug/prototype** signing key used only so sideloaded GEO EMPIRE APK builds can update an already installed prototype without uninstalling it first.

- Store password: `android`
- Key alias: `androiddebugkey`
- Key password: `android`
- This key is intentionally not a production secret.
- Do **not** use this key for Google Play or a production release.
- Before a public store launch, replace this mechanism with a private production keystore stored in protected CI secrets / Play App Signing.

The Android workflows decode this file to `android/app/debug.keystore` after `expo prebuild`. Expo's generated release configuration signs the prototype release build with that stable debug key.
