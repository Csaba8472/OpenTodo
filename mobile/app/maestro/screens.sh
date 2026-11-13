#!/usr/bin/env bash
# Every screen of the app on the Android emulator (native-app-everyday 6.1, 6.2): seeds an
# account, signs in once, then for light and dark at the standard and the largest text size
# opens each screen and saves a screenshot and the screen's hierarchy to OUT; a11y.mjs then
# checks every hierarchy (a name for every control, 48 dp targets). Run by run.sh with
# SCREENS=<dir>, which starts the server and sets the variables used here.
set -euo pipefail
cd "$(dirname "$0")"
out=$SCREENS
mkdir -p "$out"
auth=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
post() { curl -fs "${auth[@]}" -X POST "$SERVER$1" -d "$2" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
today=$(date +%F)
tomorrow=$(date -v+1d +%F 2>/dev/null || date -d tomorrow +%F)
home=$(post /api/v1/projects '{"name":"Home"}')
errand=$(post /api/v1/labels '{"name":"errand"}')
post /api/v1/tasks "{\"title\":\"Buy milk\",\"due\":{\"date\":\"$today\"},\"labels\":[\"$errand\"],\"priority\":1,\"description\":\"Oat, two cartons\"}" > /dev/null
post /api/v1/tasks "{\"title\":\"Call the plumber\",\"due\":{\"date\":\"$today\",\"time\":\"09:30\"},\"project_id\":\"$home\"}" > /dev/null
post /api/v1/tasks "{\"title\":\"Fix the shelf\",\"project_id\":\"$home\"}" > /dev/null
post /api/v1/tasks "{\"title\":\"Pick up the parcel\",\"due\":{\"date\":\"$tomorrow\"}}" > /dev/null
post /api/v1/tasks '{"title":"Read the manual"}' > /dev/null
post /api/v1/views '{"name":"Errands","query":"@errand"}' > /dev/null

env=(-e APP_ID="$APP_ID" -e SERVER="$SERVER" -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD")
maestro test --platform android "${env[@]}" common/sign-in.yaml > "$out/sign-in.log"

# name|steps after the launch (one Maestro command per ";;").
screens=(
  "today|"
  "inbox|tapOn: Inbox"
  "upcoming|tapOn: Upcoming"
  "browse|tapOn: Browse"
  "project|tapOn: Browse;;tapOn: Home"
  "label|tapOn: Browse;;scrollUntilVisible: {element: errand};;tapOn: errand"
  "view|tapOn: Browse;;scrollUntilVisible: {element: Errands};;tapOn: Errands"
  "notes|tapOn: Browse;;scrollUntilVisible: {element: Notes};;tapOn: Notes"
  "logbook|tapOn: Browse;;scrollUntilVisible: {element: Logbook};;tapOn: Logbook"
  "settings|tapOn: Browse;;scrollUntilVisible: {element: Settings};;tapOn: Settings"
  "search|tapOn: Search;;tapOn: {text: Search tasks and notes, optional: true};;inputText: milk;;hideKeyboard"
  "select|tapOn: Select;;tapOn: Buy milk"
  "task|tapOn: Buy milk"
  "when|tapOn: Buy milk;;tapOn: When"
  "menu|longPressOn: Buy milk"
  "capture|tapOn: Add task;;inputText: Call Anna tomorrow 9am p1"
  "choose|tapOn: Add task;;tapOn: Project"
)

shot() { # screen-config: the steps, then a screenshot and the hierarchy
  local name=$1 steps=$2 flow="$out/.flow.yaml"
  { echo "appId: $APP_ID"; echo "---"; echo "- launchApp"
    echo "- extendedWaitUntil: {visible: Buy milk, timeout: 20000}"
    [ -z "$steps" ] || awk -v s="$steps" 'BEGIN { n = split(s, a, ";;"); for (i = 1; i <= n; i++) print "- " a[i] }'
    echo "- waitForAnimationToEnd"; } > "$flow"
  maestro test --platform android "$flow" > "$out/.last.log" 2>&1 || { echo "screens.sh: $name failed" >&2; tail -20 "$out/.last.log" >&2; return 1; }
  adb exec-out screencap -p > "$out/$name.png"
  # The driver restarts after a test: the first call can find it gone.
  for _ in 1 2 3; do maestro --platform android hierarchy > "$out/$name.json" 2> /dev/null && break; sleep 1; done
}

failed=0
for mode in light dark; do
  for scale in 1.0 2.0; do
    adb shell cmd uimode night "$([ $mode = dark ] && echo yes || echo no)" > /dev/null
    adb shell settings put system font_scale "$scale"
    size=$([ "$scale" = 1.0 ] && echo standard || echo largest)
    for s in "${screens[@]}"; do
      # ONLY="capture choose": just those screens.
      [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" ${s%%|*} "* ]] || continue
      shot "${s%%|*}-$mode-$size" "${s#*|}" || failed=1
    done
  done
done
adb shell cmd uimode night no > /dev/null
adb shell settings put system font_scale 1.0
rm -f "$out/.flow.yaml" "$out/.last.log"
node a11y.mjs "$out"/*.json || failed=1
echo "screens.sh: $(ls "$out"/*.png | wc -l | tr -d ' ') screenshots in $out"
exit $failed
