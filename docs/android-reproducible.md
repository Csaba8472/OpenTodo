---
title: Reproducing the Android build
summary: The native Android app's pinned toolchain, release signing and reproducible-build verification.
audience: developer
section: Contributing
specs: []
screens: []
order: 90
---
# The Android app's reproducible build

F-Droid builds OpenTodo from source and publishes the project-signed APK from the GitHub release only when its own build of the same tag matches it apart from the signature. GitHub carries the APK; Google Play takes an Android App Bundle and generates APKs for each device. Switching distribution requires matching signing certificates, including the Play app-signing certificate. This page is about the native app (`mobile/app`, OpenSpec change `native-app-handover` D8), which replaces the web-view app (`mobile/android`) at the switch release. The web-view app's toolchain and its comparison script are in [`mobile/README.md`](../mobile/README.md#building-the-android-app).

## What the build is made of

The native project is not committed: `npx expo prebuild` writes `mobile/app/android/` from `mobile/app/app.config.ts`. A build of a tag is therefore:

1. `npm ci` in `mobile/app`: every JavaScript and Gradle-plugin package at the version in `package-lock.json`, checked against its integrity hash.
2. `npx expo prebuild --platform android --no-install`: the Gradle project, from the config and the installed packages only.
3. `./gradlew :app:assembleRelease`: Metro bundles the JavaScript, Hermes compiles it to bytecode, and Gradle builds the APK with the versions the packages pin.

| Tool | Pinned in |
| --- | --- |
| Node.js 24 | `node-version` in `.github/workflows/app-native.yml`; the F-Droid recipe fetches one release and checks its SHA-256 |
| npm packages, Expo SDK 58, React Native 0.88, Hermes | `mobile/app/package-lock.json` |
| Gradle, the Android Gradle Plugin, Kotlin | the React Native and Expo packages (the generated wrapper and `build.gradle`) |
| JDK | Temurin 21.0.13+9 in CI; Debian's OpenJDK 21 on F-Droid's build server |

## What has been checked

- **The JavaScript bundle is deterministic.** Two `npx expo export:embed` runs of the same tree with `--reset-cache` give byte-identical bundles (7.9 MB).
- **The rest of the APK is identical across clean builds.** Two `./gradlew clean :app:assembleRelease` runs on the same machine gave the same 1,124 of 1,125 entries outside `META-INF/` (native libraries, DEX, resources, the manifest). The one difference, the Hermes bundle, came from JavaScript files edited between the two runs, not from the build.
- **Not checked yet:** two builds of one untouched tag on two machines (a path, a user, a time zone), and F-Droid's own build. That is the switch release's step, with `scripts/android-repro.sh` extended to the native app's tag.

## Signing

The generated project signs a release with the key in `mobile/app/android/keystore.properties` when the file is there (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`, as CI writes it from the repository's secrets), with the debug key otherwise (a build for your own phone), and not at all with `-Popentodo.unsigned=true`, which is how the F-Droid recipe (`mobile/app/store/fdroid/app.opentodo.yml`) builds the APK it compares.

## No Google services

F-Droid refuses Google Play Services and Firebase. `node mobile/app/scripts/google-services.mjs` reads the release build's runtime dependency tree and fails naming any `com.google.firebase`, `com.google.android.gms`, `com.google.android.play` or `com.google.mlkit` dependency; the `app-android` job runs it on every build. The app's notifications are local (alarms and the app's own background work), never Firebase Cloud Messaging.
