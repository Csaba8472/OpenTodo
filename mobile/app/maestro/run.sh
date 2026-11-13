#!/usr/bin/env bash
# The app's Maestro flows against a throwaway server (OpenSpec change native-app-foundation,
# tasks 4.4 to 4.6): starts bin/opentodo on 127.0.0.1 with an empty data directory, creates
# the account the flows sign in with, runs every flow in this folder on the booted simulator
# and stops the server. Needs bin/opentodo (make web server), maestro, and the app installed
# from an ad-hoc signed build (the Keychain refuses an unsigned one), or on the running
# Android emulator (PLATFORM=android), whose localhost the server is forwarded to.
#   [PLATFORM=android] mobile/app/maestro/run.sh [flow.yaml…]
#   PLATFORM=android SCREENS=<dir> mobile/app/maestro/run.sh
set -euo pipefail
cd "$(dirname "$0")"
root=../../..
port=${PORT:-18080}
platform=${PLATFORM:-ios}
case $platform in
  ios) app_id=${APP_ID:-app.open-todo.ios} ;;
  android)
    # APP_ID: a build with an id of its own (OPENTODO_APP_ID, app.config.ts).
    app_id=${APP_ID:-app.opentodo}
    # A restarted adb server sees the emulator offline for a moment.
    adb wait-for-device
    adb reverse "tcp:$port" "tcp:$port" > /dev/null
    # A fresh emulator's Chrome opens its welcome screens in the sign-in tab; a phone's has none.
    adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
    adb shell am set-debug-app --persistent com.android.chrome > /dev/null
    # Reminders fire on time (reminder.yaml): exact alarms are off by default from Android 14.
    adb shell appops set "$app_id" SCHEDULE_EXACT_ALARM allow 2> /dev/null || true
    # A clean Chrome: a web app built since the last run offered its update over the sign-in form.
    adb shell pm clear com.android.chrome > /dev/null
    ;;
  *) echo "run.sh: PLATFORM is ios or android" >&2; exit 2 ;;
esac
server="http://localhost:$port"
email=tester@example.com
password=correct-horse-battery
if curl -fs "$server/api/v1/health" > /dev/null; then echo "run.sh: something already answers on port $port (PORT=… picks another)" >&2; exit 1; fi
data=$(mktemp -d)
log="$data/server.log"

OPENTODO_ADDR="127.0.0.1:$port" OPENTODO_DATA_DIR="$data" OPENTODO_BASE_URL="$server" "$root/bin/opentodo" > "$log" 2>&1 &
pid=$!
share_page_pid=
trap '[ -z "$share_page_pid" ] || kill "$share_page_pid" 2>/dev/null || true; kill $pid 2>/dev/null || true; rm -rf "$data"' EXIT
for _ in $(seq 50); do curl -fs "$server/api/v1/health" > /dev/null && break; sleep 0.2; done
curl -fs -c "$data/cookies" -X POST "$server/api/v1/auth/register" -H 'Content-Type: application/json' -H "Origin: $server" \
  -d "{\"email\":\"$email\",\"name\":\"Tester\",\"password\":\"$password\"}" > /dev/null
# A token for the flows' REST calls (scripts/), as another device of the account.
token=$(curl -fs -b "$data/cookies" -X POST "$server/api/v1/tokens" -H 'Content-Type: application/json' -H "Origin: $server" \
  -d '{"name":"maestro"}' | sed -n 's/.*"secret":"\([^"]*\)".*/\1/p')

# e2ee-unlock.yaml runs last, once the others are done: it needs the account encrypted.
# widget.yaml is followed by the background refresh and widget-refresh.yaml, share.yaml by
# two shares and share-check.yaml (device.sh).
flows=()
encrypted=false
widget=false
share=false
for f in "${@:-*.yaml}"; do
  for g in $f; do
    case $(basename "$g") in
      e2ee-unlock.yaml) encrypted=true ;;
      widget.yaml) widget=true ;;
      reminder.yaml) if [ "$platform" = android ]; then flows+=("$g"); else flows+=("ios/reminder.yaml"); fi ;;
      share.yaml) share=true ;;
      widget-refresh.yaml|share-picture.yaml|share-check.yaml|biometric.yaml|biometric-changed.yaml) ;;
      *) flows+=("$g") ;;
    esac
  done
done
passphrase='correct horse battery staple'
run() {
  local device=(test --platform "$platform")
  if [ -n "${SIM:-}" ]; then device=(--device "$SIM" "${device[@]}"); fi
  # --platform: a simulator and an emulator may run on the same machine.
  maestro "${device[@]}" -e APP_ID="$app_id" -e SERVER="$server" -e EMAIL="$email" -e PASSWORD="$password" \
    -e TOKEN="$token" -e PASSPHRASE="$passphrase" "$@" || { tail -50 "$log"; exit 1; }
}
# SCREENS=<dir>: every screen's screenshots and accessibility check instead (screens.sh).
if [ -n "${SCREENS:-}" ]; then
  APP_ID=$app_id SERVER=$server EMAIL=$email PASSWORD=$password TOKEN=$token ./screens.sh || { tail -50 "$log"; exit 1; }
  exit 0
fi
[ ${#flows[@]} -eq 0 ] || run "${flows[@]}"
if [ "${TABLET_TESTS:-0}" = 1 ]; then ../uitests/run.sh "$SIM"; fi
# The flows around the app use the platform's widget, share and background APIs.
if [ "$platform" = android ]; then . ./device.sh; else . ./ios-device.sh; fi
if $widget && [ "$platform" = android ]; then
  add_widget
  run widget.yaml
  # The app is in the background now; the change reaches it only through the refresh.
  sleep 3
  TITLE='Feed the cat'
  curl -fs -X POST "$server/api/v1/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"title\":\"$TITLE\",\"due\":{\"date\":\"$(date +%F)\"}}" > /dev/null
  force_refresh
  run widget-refresh.yaml
fi
if $share && [ "$platform" = android ]; then
  run share.yaml
  share_link
  sleep 3
  open_picture
  run share-picture.yaml
  run share-check.yaml
fi
if $widget && [ "$platform" = ios ]; then ios_widget; fi
if $share && [ "$platform" = ios ]; then ios_share_link; fi
if $encrypted; then
  (cd "$root" && go run ./mobile/app/maestro/keyrecord "$passphrase") > "$data/keys.json"
  curl -fs -b "$data/cookies" -X PUT "$server/api/v1/encryption/keys" -H 'Content-Type: application/json' -H "Origin: $server" \
    -d @"$data/keys.json" > /dev/null
  run e2ee-unlock.yaml
  # Biometric unlock (native-app-handover 2.1): a fingerprint answers the prompt; a new
  # fingerprint invalidates the key, and the passphrase comes back.
  if [ "$platform" = android ]; then
    trap 'stop_touching; clear_biometrics; kill $pid 2>/dev/null || true; rm -rf "$data"' EXIT
    enroll_fingerprint 1
    start_touching
    run biometric.yaml
    stop_touching
    enroll_fingerprint 2
    start_touching
    run biometric-changed.yaml
    stop_touching
    clear_biometrics
  else
    # Face ID unlock only: the simulator's enrollment toggle keeps the biometric set the
    # Keychain binds the key to (.biometryCurrentSet), so a changed enrollment cannot be
    # simulated here; the fallback it triggers is the shared code biometric-changed.yaml
    # covers on the emulator, with a real second fingerprint.
    trap 'ios_stop_touching; ios_enroll 0; kill $pid 2>/dev/null || true; rm -rf "$data"' EXIT
    ios_enroll 1
    ios_start_touching
    run biometric.yaml
    ios_stop_touching
    ios_enroll 0
  fi
fi
