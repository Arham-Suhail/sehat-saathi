# Sehat Saathi — Android APK (Trusted Web Activity)

The APK is a thin Android shell (Trusted Web Activity) that opens the live PWA,
https://sehat-saathi-delta.vercel.app, full screen in the phone's Chrome engine. There is
no separate app code. Everything tested in Chrome keeps working: Web Push dose alarms
when the app is closed, Web Speech, the Vapi call and the camera upload. Every website
deploy updates the app too, with no new APK needed.

Free to build and install: a self-signed APK, sideloaded via USB or file copy. There is
no Play Store or App Store account (iPhone users add the website to the Home Screen).

## Build (Linux/macOS, needs Node 20+, JDK 17, Android SDK)
```bash
npm i -g @bubblewrap/cli
cd android-twa
# one-time signing key (keep it and its passwords OUT of git)
keytool -genkeypair -v -keystore android.keystore -alias sehatsaathi -keyalg RSA -keysize 2048 \
  -validity 10000 -dname "CN=Sehat Saathi, O=Hackathon, C=PK"
bubblewrap update --skipVersionUpgrade      # generate the Android project from twa-manifest.json
bubblewrap build                             # -> app-release-signed.apk
adb install -r app-release-signed.apk        # phone on USB with USB debugging on
```

## Full screen (no URL bar)
Android only hides the URL bar after it checks that the site trusts this app. Put the
signing key's SHA-256 fingerprint (`keytool -list -v -keystore android.keystore`) in
`frontend/public/.well-known/assetlinks.json` and deploy. Until then the app still works
but shows a thin URL bar.
