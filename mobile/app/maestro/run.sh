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
trap 'kill $pid 2>/dev/null || true; rm -rf "$data"' EXIT
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
      share.yaml) share=true ;;
      widget-refresh.yaml|share-picture.yaml|share-check.yaml) ;;
      *) flows+=("$g") ;;
    esac
  done
done
passphrase='correct horse battery staple'
run() {
  # --platform: a simulator and an emulator may run on the same machine.
  maestro test --platform "$platform" -e APP_ID="$app_id" -e SERVER="$server" -e EMAIL="$email" -e PASSWORD="$password" \
    -e TOKEN="$token" -e PASSPHRASE="$passphrase" "$@" || { tail -50 "$log"; exit 1; }
}
# SCREENS=<dir>: every screen's screenshots and accessibility check instead (screens.sh).
if [ -n "${SCREENS:-}" ]; then
  APP_ID=$app_id SERVER=$server EMAIL=$email PASSWORD=$password TOKEN=$token ./screens.sh || { tail -50 "$log"; exit 1; }
  exit 0
fi
[ ${#flows[@]} -eq 0 ] || run "${flows[@]}"
# The flows around the app (the widget, the share sheet): Android only until the iOS
# extensions join the app.
[ "$platform" = android ] && . ./device.sh
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
if $encrypted; then
  (cd "$root" && go run ./mobile/app/maestro/keyrecord "$passphrase") > "$data/keys.json"
  curl -fs -b "$data/cookies" -X PUT "$server/api/v1/encryption/keys" -H 'Content-Type: application/json' -H "Origin: $server" \
    -d @"$data/keys.json" > /dev/null
  run e2ee-unlock.yaml
fi
