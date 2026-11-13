# iOS device integration, sourced by run.sh with a throwaway server and run() in scope.
# Apple documents the debugger-only background-task trigger used here:
# https://developer.apple.com/documentation/backgroundtasks/starting-and-terminating-tasks-during-development
SIM=${SIM:-$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; print(next(d["udid"] for a in json.load(sys.stdin)["devices"].values() for d in a if d["state"] == "Booted"))')}

assert_widget() {
  local group
  group=$(xcrun simctl get_app_container "$SIM" "$app_id" group.app.open-todo)
  python3 - "$group/widget.json" "$1" "$2" <<'PY'
import json, pathlib, sys, time
path, mode, title = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
end = time.monotonic() + 30
while time.monotonic() < end:
    try:
        snapshot = json.loads(path.read_text())
        names = [t.get('title') for t in snapshot['tasks']]
        if (title in names) == (mode == 'contains'):
            print('widget:', mode, title, 'count', snapshot['count'])
            break
    except (OSError, ValueError, KeyError):
        pass
    time.sleep(0.2)
else:
    raise SystemExit('widget did not converge: ' + path.read_text())
PY
}

ios_debugger() {
  local app_pid
  app_pid=$(xcrun simctl spawn "$SIM" launchctl list | awk -v id="$app_id" 'index($3, "UIKitApplication:" id "[") {print $1; exit}')
  [ -n "$app_pid" ] && [ "$app_pid" != '-' ] || { echo 'No app process for the background-task trigger' >&2; return 1; }
  python3 - "$app_pid" "$data/refresh-debugger.log" "$@" <<'PYTHON'
import subprocess, sys
args = ['lldb', '-b', '-p', sys.argv[1]]
for command in sys.argv[3:] + ['detach', 'quit']: args += ['-o', command]
with open(sys.argv[2], 'w') as log:
    try:
        subprocess.run(args, stdout=log, stderr=subprocess.STDOUT, timeout=30, check=True)
    except (subprocess.SubprocessError, OSError) as error:
        log.flush()
        print(open(sys.argv[2]).read())
        raise SystemExit(str(error))
PYTHON
  if grep -q 'error:' "$data/refresh-debugger.log"; then cat "$data/refresh-debugger.log" >&2; return 1; fi
}

keep_ios_awake() {
  # Attach before Home. Without a background assertion the simulator suspends the
  # process before LLDB can run its debugger-only launch expression.
  ios_debugger 'expression -l objc++ -- @import UIKit;' \
    'expression -l objc++ -- (unsigned long)[[UIApplication sharedApplication] beginBackgroundTaskWithExpirationHandler:^{}];'
  ios_hold=$(python3 - "$data/refresh-debugger.log" <<'PYTHON'
import re, sys
print(re.search(r'\(unsigned long\) \$\d+ = (\d+)', open(sys.argv[1]).read()).group(1))
PYTHON
)
}

force_ios_refresh() {
  ios_debugger 'expression -l objc++ -- @import BackgroundTasks;' \
    'expression -l objc++ -- dispatch_async(dispatch_get_global_queue(0, 0), ^{ (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"app.opentodo.refresh"]; });'
}

end_ios_awake() {
  ios_debugger 'expression -l objc++ -- @import UIKit;' \
    "expression -l objc++ -- [[UIApplication sharedApplication] endBackgroundTask:$ios_hold];"
}

ios_widget() {
  run ios/widget.yaml
  assert_widget contains 'Water the plants'
  keep_ios_awake
  run ios/home.yaml
  # The app stays behind the home screen; only the simulated BG task pulls this change.
  curl -fs -X POST "$server/api/v1/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"title\":\"Feed the cat\",\"due\":{\"date\":\"$(date +%F)\"}}" > /dev/null
  force_ios_refresh
  assert_widget contains 'Feed the cat'
  end_ios_awake
  run ios/widget-complete.yaml
  assert_widget excludes 'Water the plants'
  run ios/sign-out.yaml
}

ios_share_link() {
  run share.yaml
  # The shared page is local to this test, with a stable title, without an external site.
  python3 -u - "$data/share-port" <<'PY' &
import http.server, pathlib, sys
class Page(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'<!doctype html><title>An article worth reading</title><h1>An article worth reading</h1><p>Share this page to OpenTodo.</p>'
        self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args): pass
server = http.server.HTTPServer(('127.0.0.1', 0), Page)
pathlib.Path(sys.argv[1]).write_text(str(server.server_port))
server.serve_forever()
PY
  share_page_pid=$!
  local page_port
  for _ in $(seq 30); do [ -s "$data/share-port" ] && break; sleep 0.1; done
  page_port=$(cat "$data/share-port")
  xcrun simctl openurl "$SIM" "http://localhost:$page_port/article"
  # Safari's share sheet through XCTest (uitests/ShareTests.swift): Maestro's taps miss its cells.
  TEST_RUNNER_OPENTODO_SHARE_PAGE=1 ../uitests/run.sh "$SIM" -only-testing:NativeInteractionTests/SafariShareTests/testShareFromSafari
  run ios/share-check.yaml
  kill "$share_page_pid"
  share_page_pid=
}

# Simulator-only Darwin controls used by AppleSimulatorUtils 0.9.12 as well:
# https://github.com/wix/AppleSimulatorUtils/blob/0.9.12/applesimutils/applesimutils/main.m
ios_enroll() {
  xcrun simctl spawn "$SIM" notifyutil -s com.apple.BiometricKit.enrollmentChanged "$1"
  xcrun simctl spawn "$SIM" notifyutil -p com.apple.BiometricKit.enrollmentChanged
}
ios_touching=
ios_start_touching() {
  ( while :; do xcrun simctl spawn "$SIM" notifyutil -p com.apple.BiometricKit_Sim.pearl.match; sleep 1; done ) &
  ios_touching=$!
}
ios_stop_touching() { [ -z "$ios_touching" ] || kill "$ios_touching" 2>/dev/null || true; ios_touching=; }
