#!/usr/bin/env bash
# Simulator update from the built 1.x shell to the native app, preserving UserDefaults.
# Usage: run.sh <simulator-udid> <shell.app> <native.app>
set -euo pipefail
sim=$1
shell_app=$2
native_app=$3
cd "$(dirname "$0")"
port=${PORT:-18083}
server="http://localhost:$port"
if curl -fs "$server/healthz" >/dev/null; then echo "upgrade: port $port is occupied" >&2; exit 1; fi
data=$(mktemp -d)
OPENTODO_DATA_DIR=$data OPENTODO_ADDR="127.0.0.1:$port" OPENTODO_BASE_URL=$server ../../../../bin/opentodo > "$data/server.log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true; rm -rf "$data"' EXIT
for _ in $(seq 50); do curl -fs "$server/healthz" >/dev/null && break; sleep 0.2; done
xcrun simctl boot "$sim" 2>/dev/null || true
xcrun simctl install "$sim" "$shell_app"
maestro --device "$sim" test --platform ios -e SERVER="$server" shell.yaml
prefs=$(xcrun simctl get_app_container "$sim" app.open-todo.ios data)/Library/Preferences/app.open-todo.ios.plist
python3 - "$prefs" "$server" <<'PY'
import pathlib, plistlib, sys, time
p, expected = pathlib.Path(sys.argv[1]), sys.argv[2]
end = time.monotonic() + 15
while time.monotonic() < end:
    try:
        if plistlib.loads(p.read_bytes()).get('server.origin') == expected:
            break
    except (OSError, plistlib.InvalidFileException):
        pass
    time.sleep(0.1)
else:
    raise SystemExit('The shell did not persist its connected server')
PY
xcrun simctl terminate "$sim" app.open-todo.ios
xcrun simctl install "$sim" "$native_app"
maestro --device "$sim" test --platform ios -e SERVER="$server" native.yaml
