# Design

## Context and dependency

This change follows `native-app-handover`. The iOS app is React Native with a local SQLite account, the shared quick-add parser and operation log, and `opentodo-shared-container` for App Group storage and background work. The widget and share targets live in `mobile/app/targets`. It does not load a web view. The separate Shortcuts pack still supports browser-only users.

## Decisions

### D1. Durable on-device captures

An App Intent appends `{id, text, createdAt, source}` to `capture-queue.json` in the App Group. The id is a UUID; text is trimmed and at most 500 characters; source is `siri`, `shortcut`, `widget` or `control`. File access is coordinated across the app and extensions and uses complete Data Protection. At most 50 entries wait. A full queue refuses the new capture with an actionable answer and never drops an existing entry. Entries do not expire.

The native app drains the queue through its Expo module at launch, foreground, after sync and after unlock. It parses the line in the account's languages with the shared quick-add parser and writes through `mutate()` with the capture id as the task id. It acknowledges only after the task exists locally. A restart between write and acknowledgement therefore creates no duplicate. Offline tasks wait in the normal outbox.

An encrypted account files captures only while unlocked. Until then text stays in the protected App Group and never goes to the server. Sign-out shows the number of waiting captures before confirmation and deletes them on confirmation; changing accounts never transfers a queue to another person. Extend the module's existing sign-out cleanup.

Rejected: a separate REST credential, writing SQLite from Swift, and opening the app on every Siri request. The existing app runtime owns parsing, encryption and ops.

### D2. Best-effort filing without a screen

App Intents in the app target run in the app process. After queueing, the intent signals the native app's background JavaScript entry point and waits at most eight seconds for acknowledgement. There is no `HiddenRun` or web page to load. Offline filing can succeed because the account is local; an unlocked account key is available only when the app already holds it in memory.

Siri says "Added to OpenTodo" if acknowledged, otherwise "Saved on this iPhone. OpenTodo adds it the next time the app runs", or "… once you unlock OpenTodo" when the last publication was locked. Runtime startup failure leaves the entry queued. Native intents make no network calls.

### D3. The Expo module contract

Add `readCaptures()` and `ackCaptures(ids)` to `mobile/app/modules/opentodo-shared-container`, plus an event for an appended capture. Read does not consume. Versioned JSON fixtures are shared between Jest and Swift tests. Browser code and the retired shell bridge gain no capability or method.

### D4. Intents and phrases

| Intent | Opens the app | Behavior |
| --- | --- | --- |
| Add task, text requested when absent | No | D1–D2 |
| Open quick add | Yes | `opentodo://add` |
| Open Today | Yes | `opentodo://today` |
| What's on today | No | Last widget snapshot: count, overdue count, at most five titles/times and publication time; counts only when locked; an open-once hint with no snapshot |

Use an `AppShortcutsProvider` with phrases naming OpenTodo in English, German, French, Spanish, Italian and Portuguese. The Action Button and a user's own Shortcuts invoke the same intents. Do not add task editing or search intents.

### D5. Widget surfaces

Extend `mobile/app/targets/widget`: a systemSmall Add button; accessoryCircular count/overdue and Add widgets; accessoryRectangular next tasks; accessoryInline summary; and an Add task ControlWidgetButton on iOS 18+. All read the handover's Today snapshot, never a network. Lock-screen titles use `privacySensitive()` and follow the unlocked-publication rule; show the update time where there is room. Quick add uses `opentodo://add`, handled by the native capture sheet. Existing Today widgets stay intact on both platforms.

### D6. Browser Shortcuts pack

Keep plist sources in `mobile/shortcuts/`, signed with `shortcuts sign --mode anyone` on final-tag macOS CI, or manually by the owner if headless signing is unavailable. Publish `OpenTodo-Add.shortcut` and `OpenTodo-Today.shortcut`.

Add to OpenTodo defaults to the token-free `/share?title=` capture screen. Quick save uses a dedicated `full` token, reads `/api/v1/me` first, and uses the capture screen instead for encrypted accounts. Otherwise parse through `/api/v1/quick-add/parse`, then create through `/api/v1/tasks`. On 401, 403 or a ten-second timeout, fall back once with the original text and explain why. At most one task per run. OpenTodo Today opens `/today` on the configured server. Import questions ask for server, mode and token; docs recommend a dedicated device token and forbid an admin token. No other host is contacted and no new token scope is introduced.

## Impact and verification

No schema, server route, op field or dependency is added. Estimated app growth: 150 KB for intents, widgets and strings using system frameworks. The browser bundle and server binary are unchanged. The native parser and op path remain shared; test offline filing, interruption, locked-account deferral, queue limits, sign-out and the exact payload fixture. Run native prebuild/build lanes and Maestro flows; real-device Siri, locked-phone and Action Button checks remain release evidence.
