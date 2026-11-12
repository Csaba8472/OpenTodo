#!/usr/bin/env bash
# The app's Maestro flows against a throwaway server (OpenSpec change native-app-foundation,
# tasks 4.4 to 4.6): starts bin/opentodo on 127.0.0.1 with an empty data directory, creates
# the account the flows sign in with, runs every flow in this folder on the booted simulator
# and stops the server. Needs bin/opentodo (make web server), maestro, and the app installed
# from an ad-hoc signed build (the Keychain refuses an unsigned one).
#   mobile/app/maestro/run.sh [flow.yaml…]
set -euo pipefail
cd "$(dirname "$0")"
root=../../..
port=${PORT:-18080}
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

flows=("$@")
[ ${#flows[@]} -gt 0 ] || flows=(*.yaml)
# --platform ios: an Android emulator running on the same machine would be picked otherwise.
maestro test --platform ios -e SERVER="$server" -e EMAIL="$email" -e PASSWORD="$password" -e TOKEN="$token" "${flows[@]}" || { tail -50 "$log"; exit 1; }
