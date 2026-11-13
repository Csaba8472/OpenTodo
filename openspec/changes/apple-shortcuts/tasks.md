# Tasks

Depends on `native-app-handover`. Use `mobile/app`, its Expo module and widget targets; do not extend or restore the web-view shells.

## 1. Capture queue and native filing

- [ ] 1.1 Add the coordinated, protected App Group queue with append/read/ack, the 50-entry and 500-character limits, and the module event. Verify Swift unit tests for bounds, trim, named acknowledgements, unknown ids and file protection.
- [ ] 1.2 Drain through the app's background/foreground runtime, shared parser and ops; use the capture id as task id and acknowledge after local commit. Verify Jest tests for offline filing, interrupted acknowledgement, retry, locked-account deferral and unlock.
- [ ] 1.3 Add shared JSON fixtures and enforce them in Jest and Swift tests. Verify both readers reject malformed input and agree on the version.
- [ ] 1.4 Show waiting-capture count in the native sign-out confirmation and extend account cleanup. Verify no capture reaches the next account and translated messages pass `make i18n-check`.

## 2. App Intents and widgets

- [ ] 2.1 Add AddTaskIntent, signal the existing background JavaScript entry point, and wait at most eight seconds. Verify tests with filed, timeout, unavailable runtime, locked account and full queue outcomes.
- [ ] 2.2 Add quick-add and Today intents with the native deep links, and the read-only Today intent from the widget snapshot. Verify empty, stale, locked and five-row cases without a network request.
- [ ] 2.3 Add AppShortcutsProvider phrases in en/de/fr/es/it/pt and extend the catalog checker. Verify the app name in every phrase and `make i18n-check`.
- [ ] 2.4 Extend the widget target with quick add, lock-screen count/tasks/summary/Add and an iOS 18+ control. Verify the iOS 16.4 deployment build, shared snapshot fixture, private titles and no network access.
- [ ] 2.5 Record real-device Siri, Action Button, offline/locked capture, lock-screen privacy and control checks in `mobile/README.md`.

## 3. Browser Shortcuts pack

- [ ] 3.1 Add the two plist sources and import questions. Verify only the configured host is used, encryption falls back to `/share?title=`, and 401/403/timeout paths create at most one task.
- [ ] 3.2 Sign and attach both Shortcuts on a final release; document the manual-owner signing fallback if headless signing is unavailable. Verify the release artifacts.

## 4. Documentation and checks

- [ ] 4.1 Write `docs/apple-shortcuts.md`, update the app and installation guides and add a changelog fragment under `changelog.d/Added/`. Verify `make docs` and `make docs-check`.
- [ ] 4.2 Run app typecheck/lint/Jest, the iOS build and Maestro flows, Shortcuts tests, `make openspec-validate`, `make repo-check` and `make check`.
