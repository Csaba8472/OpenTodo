# The Android device around the app (native-app-handover), sourced by run.sh with
# $app_id: what Maestro cannot do, through adb.
#   add_widget     puts the Today widget on the home screen once (the launcher's widget
#                  picker, a long press and a drag; Pixel Launcher's layout)
#   force_refresh  runs the app's background refresh now (its WorkManager job)
#   share_link     shares a page's title and address to the app, as a browser's Share does
#   open_picture   puts a picture in Download and opens the Files app (share-picture.yaml
#                  shares it from there: a shell cannot grant another app a file)
#   enroll_fingerprint, start_touching, stop_touching, clear_biometrics: biometric.yaml

# The centre of the first node whose attributes match $1, from the screen's hierarchy.
centre() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null
  adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -m1 "$1" |
    sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/' | awk '{print int(($1+$3)/2), int(($2+$4)/2)}' || true
}

has_widget() {
  adb shell dumpsys appwidget | sed -n '/^Widgets:/,/^Hosts:/p' | grep -q "$app_id/app.opentodo.container.TodayWidget"
}

add_widget() {
  if has_widget; then return; fi
  adb shell input keyevent KEYCODE_HOME
  sleep 1
  adb shell input touchscreen swipe 540 1000 541 1001 2500
  adb shell input tap $(centre 'text="Widgets"')
  sleep 2
  adb shell input tap $(centre 'text="Search"')
  adb shell input text OpenTodo
  sleep 2
  adb shell input tap $(centre 'text="Quick add, Today"')
  sleep 2
  set -- $(centre 'content-desc="Today widget"')
  # Above the label: the preview itself, which the launcher lets a long press pick up.
  local x=$1 y=$(($2 - 340))
  adb shell "input motionevent DOWN $x $y; sleep 1.5; input motionevent MOVE $x $((y - 200)); sleep 0.3; input motionevent MOVE 540 1100; sleep 0.3; input motionevent MOVE 540 700; sleep 0.5; input motionevent MOVE 540 650; sleep 1; input motionevent UP 540 650"
  sleep 2
  adb shell input keyevent KEYCODE_HOME
  has_widget || { echo "run.sh: the Today widget could not be added" >&2; exit 1; }
}

force_refresh() {
  # `JOB #u0a99/3: … <app>/androidx.work…`, or from Android 14 with WorkManager's namespace:
  # `JOB androidx.work.systemjobscheduler:u0a99/0: … @androidx.work.systemjobscheduler@<app>/…`.
  local line ns job
  line=$(adb shell dumpsys jobscheduler | grep -E "^ *JOB .*$app_id/androidx\.work" | head -1)
  [ -n "$line" ] || { echo "run.sh: no background refresh is scheduled" >&2; exit 1; }
  job=$(echo "$line" | sed -E 's/^ *JOB [^/]*\/([0-9]+):.*/\1/')
  ns=$(echo "$line" | sed -nE 's/^ *JOB ([^:# ]+):u.*/\1/p')
  # WorkManager refuses a periodic run before its time, forced or not: the clock goes an
  # hour ahead for the run, then back.
  local now
  now=$(adb shell date +%s | tr -d '\r')
  adb shell cmd alarm set-time $(((now + 3900) * 1000))
  if [ -n "$ns" ]; then adb shell cmd jobscheduler run -f -n "$ns" "$app_id" "$job" > /dev/null
  else adb shell cmd jobscheduler run -f "$app_id" "$job" > /dev/null; fi
  sleep 10
  adb shell cmd alarm set-time "$(($(date +%s) * 1000))"
}

share_link() {
  adb shell am start -a android.intent.action.SEND -t text/plain -p "$app_id" \
    --es android.intent.extra.SUBJECT "'An article worth reading'" --es android.intent.extra.TEXT https://example.com/article > /dev/null
}

open_picture() {
  local png
  png=$(mktemp -t receipt)
  # A 64×64 red PNG, so the shared file is a real image.
  echo 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfMEMY2liH8OITBAtzm7PV1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYB/FJBPPKcubgAAAAASUVORK5CYII=' | base64 -d > "$png"
  adb push "$png" /sdcard/Download/receipt.png > /dev/null
  rm -f "$png"
  adb shell am start -a android.intent.action.VIEW -d content://com.android.externalstorage.documents/root/primary -t vnd.android.document/root > /dev/null
}

# Biometric unlock (biometric.yaml): a screen lock and a fingerprint on the emulator, and a
# finger on its sensor while a flow runs, which answers any fingerprint prompt.
enroll_fingerprint() {
  local finger=$1 b c i
  adb shell locksettings set-pin 1234 > /dev/null 2>&1 || true
  adb shell am start -a android.settings.FINGERPRINT_ENROLL > /dev/null
  sleep 3
  adb shell input text 1234
  adb shell input keyevent KEYCODE_ENTER
  sleep 3
  for b in MORE MORE MORE 'I AGREE' START; do
    c=$(centre "text=\"$b\"")
    if [ -n "$c" ]; then adb shell input tap $c; sleep 1.5; fi
  done
  for i in $(seq 12); do adb emu finger touch "$finger" > /dev/null; sleep 0.6; adb emu finger remove > /dev/null; sleep 0.6; done
  sleep 2
  c=$(centre 'text="DONE"')
  [ -n "$c" ] || { echo "run.sh: fingerprint $finger was not enrolled" >&2; exit 1; }
  adb shell input tap $c
}

toucher=
start_touching() {
  ( while :; do adb emu finger touch 1 > /dev/null; sleep 1; adb emu finger remove > /dev/null; sleep 1; done ) &
  toucher=$!
}

stop_touching() {
  [ -z "$toucher" ] || kill "$toucher" 2> /dev/null || true
  toucher=
}

# Without the screen lock the fingerprints go too: the emulator as it was.
clear_biometrics() {
  adb shell locksettings clear --old 1234 > /dev/null 2>&1 || true
}
