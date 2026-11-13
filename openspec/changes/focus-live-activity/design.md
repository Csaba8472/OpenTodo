# Design

## Context and dependency

This change follows `native-app-handover` and targets `mobile/app`, its Expo module and existing widget extension. The shells and `web/src/lib/shell.ts` are not an integration surface. Focus currently runs on the web, so this change must first supply the native Focus screen and device-local controller using the existing Focus rules. It must not assume a web view can run the timer.

## Decisions

### D0. Native Focus uses shared transitions

Bring the existing Focus modes, preferences, task selection and time-entry semantics into a native screen. Extract or adapt the pure state transitions from `web/src/lib/focus` behind the platform port; retain the shared vectors and use the ordinary op path for time entries. Keep one FocusState row on this device, as on the web. Opening the screen reconciles elapsed time from the clock; background work never ticks a JavaScript timer just to update a display.

This is a prerequisite within this change, verified before the system surfaces. The web Focus screen and its service-worker notification keep working independently. No server, schema, op field or timer sync is introduced.

### D1. One snapshot on every transition

The app hands its Expo module `publishFocus(json)`:
`{v: 1, state: "running"|"paused"|"done"|"none", taskId?, title?, mode, phase: "work"|"break", breakKind?, cycle?, cycleLength?, phaseStartedAt, runningSince?, elapsedMs, plannedEndAt?, plannedMs?}`.

Elapsed time is accumulated before the current stretch; runningSince is present only while running. Planned end is computed for timed phases only, absent during Flowtime work and pause. Publish after start, pause, resume, phase/end/task changes, Take a break, leaving the screen and restoring a stored session. Publish none before sign-out, on encryption lock and when no session remains. Native code replaces the entire snapshot idempotently.

Use shared, versioned JSON fixtures tested by Jest, Swift and Kotlin. No browser bridge capability is added.

### D2. System clocks and staleness

On iOS, ActivityKit draws the countdown with a timer interval, Flowtime as a count-up shifted by accumulated time, and pause as a frozen value. Set staleDate to plannedEndAt; a stale activity says Session done / Open to continue. End with dismissal after plannedEndAt plus fifteen minutes when done is published; none removes it immediately. The system's eight-hour activity limit bounds a killed app that never runs again.

Android uses a quiet ongoing notification with setWhen and a chronometer, counting down for timed phases and up for Flowtime. An exact alarm, or inexact fallback when denied, replaces it with Session done at the planned end. No APNs, FCM, push relay or recurring background clock updates.

### D3. One session-end notification

The native module schedules Session done for work or Break over for a timed break, naming the task only if a title was allowed. Replace on every publication; cancel on paused, done, none and sign-out. The native screen does not invoke the browser notification path. Browser behavior stays unchanged. Automatic next phases start only when the app's shared controller next reconciles; docs state that a sleeping app can show Session done until reopened.

### D4. Pause and Resume open the app

Use `opentodo://focus?action=pause|resume` from the Live Activity and Android PendingIntent. The native navigator opens Focus and invokes the same transition as its keyboard/control action once the account is ready. A stale action is a no-op; consume it after handling so reopening never repeats it. Pausing stops its time entry through ops. No background-only pause action or hidden web run is added.

### D5. Private titles

Include a title only when the device's include-task-titles option is on and the account is not encrypted. Otherwise use Focus session. Links and buttons carry no content. Encrypted titles never enter App Group publications or system notifications.

### D6. System controls

Honor ActivityAuthorizationInfo.areActivitiesEnabled and the Android Focus notification channel switch. Do not add a duplicate OpenTodo setting. Local session-end notification permission is independent of Live Activities.

### D7. Lifecycle

Extend the module's account cleanup: clear stored state, end all activities and cancel session-end notifications/alarms on none or sign-out. A different account cannot see a previous session. After process death, read the local state and reconcile with the existing activity rather than creating a second. End extra activities if any exist. At most one surface represents the device's session.

## Impact and size

No server or web bundle change is needed. Store only the device-local state and native publication; time entries use the existing op contract. ActivityKit is a system framework in the existing widget target, approximately 80 KB. Android's channel, builder and receiver add approximately 10 KB without a dependency. Measure the native Focus screen/controller size in the implementation and report it; it is additional to these estimates, not hidden in them.

## Interface and verification

Focus is an explicit native destination/action, following existing navigation, sheets and tokens. It adds no task property or browser chrome, and creates no activity until a session starts. Verify shared transition vectors and time-entry ops before widget work, then app restart, encrypted-title omission, one notification per end, stale links, exact-alarm fallback and system opt-outs. Record locked-phone/Dynamic Island and Android background checks on real devices.

`focus-session-readable` remains independent; `apple-shortcuts` shares the module and widget target but neither change needs the other's payload.
