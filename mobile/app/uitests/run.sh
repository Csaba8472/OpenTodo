#!/usr/bin/env bash
# Run after the tablet Maestro flow while its throwaway server is still alive.
set -euo pipefail
sim=$1
shift
sources=$(cd "$(dirname "$0")" && pwd)
out=${NATIVE_UI_OUT:-$(mktemp -d -t opentodo-native-ui)}
mkdir -p "$out"
cp "$sources/project.yml" "$sources/Harness.swift" "$sources/InteractionTests.swift" "$sources/ShareTests.swift" "$out/"
xcodegen generate --spec "$out/project.yml"
xcodebuild -quiet -project "$out/NativeInteractions.xcodeproj" -scheme NativeInteractions \
  -destination "id=$sim" -derivedDataPath "$out/build" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- "$@" test
printf 'Native interaction results: %s\n' "$out/build/Logs/Test"
