# Tasks

Depends on `native-app-handover`. Work in the native app, its Expo module and widget target; do not restore shell code or publish from the browser.

## 1. Native Focus and shared contract

- [ ] 1.1 Add a native Focus screen/controller using the existing shared modes, transitions and preferences. Keep state local and time-entry writes on ops. Verify shared vectors, pause/resume time entries, clock reconciliation and offline/restart behavior in Jest and Maestro.
- [ ] 1.2 Build the full versioned publication and send it after every transition, restore, lock and sign-out. Verify fields for running/paused/done/none, Flowtime without a planned end and encrypted accounts without titles.
- [ ] 1.3 Add the Expo module method and shared running/paused/Flowtime/none fixtures. Verify parsing and malformed-version rejection in Jest, Swift and Kotlin.
- [ ] 1.4 Add the native Focus deep link and apply Pause/Resume through the same controller once, after account readiness. Verify stale actions are no-ops and restored links are not replayed.

## 2. iOS

- [ ] 2.1 Configure NSSupportsLiveActivities through the app config plugin; add ActivityAttributes and reconciliation in the module. Verify stale dates, idempotent update, system opt-out and ending extra activities with a fake activity store.
- [ ] 2.2 Add lock-screen and compact/minimal/expanded Dynamic Island views to `mobile/app/targets/widget`, with system clocks, frozen pause and stale Session done. Verify the iOS deployment build and native deep links.
- [ ] 2.3 Schedule/reschedule/cancel the local session-end notification and clean up all stored state on sign-out. Verify fake notification-center tests and account switching.
- [ ] 2.4 Add the six-language string catalog entries and record real-device locked-phone, Dynamic Island, Pause/Resume, stale state and killed/reopened checks in `mobile/README.md`.

## 3. Android

- [ ] 3.1 Add the fixture-backed state parser and pure ongoing-notification model. Verify phase labels, chronometer direction, elapsed time and content-free action links in JVM tests.
- [ ] 3.2 Add the quiet Focus channel, single ongoing notification, native intent handling and session-end exact/inexact alarm. Verify posting/removal and denied-alarm fallback in instrumented tests.
- [ ] 3.3 Extend sign-out cleanup, add translated strings and record background, Pause/Resume and session-end checks on an emulator or device.

## 4. Documentation and checks

- [ ] 4.1 Update `docs/focus.md`, the app guides and `mobile/README.md` with native behavior, privacy, system opt-outs and auto-start waiting for the app. Add a fragment under `changelog.d/Added/`. Verify `make docs` and `make docs-check`.
- [ ] 4.2 Report measured app/bundle size, run app typecheck/lint/Jest, native builds and flows, `make openspec-validate`, `make repo-check` and `make check`.
