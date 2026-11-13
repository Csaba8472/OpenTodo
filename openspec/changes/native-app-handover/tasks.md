# Tasks

## 1. Outside the app

- [x] 1.1 Add the Expo module `opentodo-shared-container` (App Group and SharedPreferences read and write, widget reload). Verify: Jest tests with the module mocked, and a Maestro flow on the simulator reading back a written snapshot.
- [x] 1.2 Move the Swift widget and share extension to `mobile/app/targets/` with the config plugin. Keep the snapshot JSON as a shared fixture of `shellPublish`'s format. Verify: `app-ios` builds both extensions, and a fixture test checks that the app's snapshot equals the fixture.
- [x] 1.3 Publish on change, sync and refresh with the stale time (D2). Verify: Maestro `widget` flows for complete-in-app and changed-on-web.
- [x] 1.4 Drain the share inbox into tasks at launch and on foreground. Add the Android share intent. Verify: the Maestro `share-link` flow on both platforms.
- [x] 1.5 Schedule device reminders (60-window), add the Complete and Snooze actions, and fire once per device. Verify: Jest tests of the window and the reschedule, and the Maestro `reminder-complete` flow.
- [x] 1.6 Add background refresh (BGAppRefreshTask, WorkManager): pull, widget, reminders, local notifications for new in-app notifications. Verify: a simulator-triggered background task in a Maestro flow, and docs stating the delay.

## 2. Unlock, iPad, Android

- [x] 2.1 Add biometric unlock with a hardware-wrapped key and the passphrase fallback. Verify: the Maestro `biometric` flow with simulated Face ID enrolled and changed.
- [x] 2.2 Build the iPad split view, keyboard shortcuts, pointer hover and drag to a sidebar project. Set the target to iPhone and iPad. Verify: Maestro flows on an iPad simulator, and screenshots at regular and compact width.
- [x] 2.3 Add the Android widget with the same snapshot. Add the Google Play AAB path and the F-Droid metadata, and a CI check that refuses Google Play Services and Firebase. Verify: `app-android` with the dependency check, and a reproducible-build note in `docs/android-reproducible.md`.

## 3. Gate and switch

- [x] 3.1 Add the go/no-go checklist to `RELEASING.md`, and a `make app-gate` that prints the nightly budgets and Maestro history. Verify: the command prints the last three nightly results.
- [x] 3.2 Prepare the shell's last release: flush the outbox, show the one-time notice. Verify: a shell test with an unsent op; ships two weeks before the switch.
- [x] 3.3 Prepare the switch release: the existing bundle id and application id, higher build numbers, address prefill from the shell's storage. Verify: a simulator upgrade test that installs the shell, then the app, and checks the prefilled address.
- [ ] 3.4 After both stores ship it, delete the shell code, `shell.ts` and its fixtures, the shells' CI lanes and `ios-walkthrough.yml`. (No preview record to retire: the trial used the existing one, `native-app-foundation` D10.) Verify: `make check`, `make bundle-budget` (smaller), and `scripts/ci-changes.sh` tests updated.
- [x] 3.5 Rewrite `docs/ios-app.md` and `docs/install-phone.md` for the app. Update `apple-shortcuts` and `focus-live-activity` to build on the native app. Add `changelog.d/Changed/native-app-handover.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`.

## Verification notes (2026-11-13)

- 3.1: the report/parser tests pass, and `make app-gate APP_GATE_REPO=OpenTodoApp/OpenTodo` prints the last three upstream nightlies. This fork has no nightly workflow yet. The two runs with performance artifacts exceed the 1,000 ms cold-start budget (2,068 ms and 2,355 ms); the third has no app jobs. The gate is not approved.
- 3.2: the three shell-handover tests pass, including flushing an unsent op before the notice. The release flag remains off by default; the last shell release has not been published.
- The iOS Today Maestro flow passes, including completion, undo, server convergence and sign-out. Its confirmation selector now chooses the alert button beside Cancel, avoiding the obscured Settings row.
- The iOS app builds with both extensions. The iPad split view needs the screens package's Gamma native build flag; simulator verification is still in progress.
- 3.4 is intentionally pending: both store releases and the owner's go/no-go approval must precede shell deletion.

- 1.1–1.2: the native iOS Release build includes both extensions; the shared widget fixture and app tests pass, and the simulator reads back the Today snapshot from the App Group.
- 2.3: the arm64 Android Release APK, AAB and native unit tests build. The complete release dependency tree contains no Google Play Services or Firebase. The unsigned multi-ABI F-Droid reproduction remains a release procedure, documented separately.
- 3.3: the full simulator test installs the SwiftUI shell, saves its address, then installs the native app without clearing state. The server prefill and sign-in explanation pass. The generated native AppDelegate handles restored SwiftUI scene sessions.
- 3.5: the native app guides and follow-on OpenSpec plans are updated; docs and all 159 OpenSpec items validate.
- Durability regressions pass for memory-only encryption reloads, action retry after disk failure, missing reminder actions, upload retries after a lost response, and share/upload jobs interrupted by an account switch. Native integration tests continue below; store release and shell deletion remain gated.

- 1.5: the Android notification flow fires a local reminder, completes it using Done without opening the app, and observes completion on the server. The 60-reminder window, snooze and durable action-retry tests pass.

- 1.3 and 1.6: Android widget completion and WorkManager refresh flows pass. On iOS, the App Group snapshot removes an in-app completed task and gains a web-created task after the simulator-triggered BGAppRefreshTask while on Home. The final cleanup flow is being rechecked after adding the missing foreground launch.
- 2.1: Android passphrase rejection, encrypted capture/server ciphertext, cold-start unlock, fingerprint unlock and enrollment-change fallback all pass. iOS simulated Face ID verification remains in progress.

- The full iOS widget/background/cleanup flow now passes. The Android widget, background refresh, ciphertext capture, cold-start unlock, fingerprint unlock and changed-enrollment flows all pass. iPad keyboard capture/search/destination switching and native project drag pass their XCTest checks; arrow/Space and compact-window coverage are being finished.

- 1.4: the share flows pass on both platforms. Android: a page's link (the share intent) and a picture shared from Files become Inbox tasks, the picture uploaded as an attachment. iOS: a page shared from Safari becomes an Inbox task titled after the page with its link in the notes, the next time the app opens. Safari hands a page's title to the extension as text beside the link, so the extension now takes one such line as the title (the web-view app's capture screen gets it too). The Safari share sheet is driven by XCTest (`uitests/ShareTests.swift`): Maestro reports the sheet's elements in its remote view's coordinates and its taps miss them.
- 2.1: on iOS, the encrypted account's passphrase flow and the cold start unlocked with simulated Face ID pass. An enrollment change cannot be simulated there: the simulator's enrollment toggle keeps the biometric set the Keychain item is bound to (`expo-secure-store` uses `.biometryCurrentSet`). The fallback it triggers is the shared code the Android flow covers with a real second fingerprint.
- 2.2: on the iPad simulator, the regular-width flow (sidebar, list and detail together, editing, capture), ⌘F search, ⌘1–5 destinations, N capture, arrow selection with Space to complete, dragging a task onto a sidebar project, and the compact window (the iPhone layout with the tab bar, screenshot `ipad-compact`, window restored) pass. The first synthesized key after launch is lost while the simulator connects XCTest's hardware keyboard, so the tests press Escape first. Pointer hover (`onHoverIn`/`onHoverOut` on rows) is checked by reading only: XCTest has no hover on iOS.

