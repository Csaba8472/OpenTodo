# Tasks

- [x] 1.1 Long press on a label in Browse opens Rename and Delete label…, also as the row's accessibility actions. Rename in a sheet through the shared `updateLabel` (an existing name refused); delete after a confirmation with the number of tasks through `deleteLabel`. Verify: Jest tests of the rename refusal and of the deletion leaving the tasks, and the Maestro `labels` flow on Android.

## Verification notes (2026-11-13)

- 1.1: the Jest tests pass (a new name taken; a name another label has refused with nothing changed; the confirmation's count; deleting removes the label from its two tasks, which stay). The Maestro `labels` flow passes on the Android emulator: long press, Rename in the sheet, long press, Delete label… with "It is removed from 1 task. The tasks themselves stay.", and the server has the label deleted and the task kept without it.
- Found on the way: Android drops an alert opened while the previous one is closing, so a menu's action now runs once its dialog has closed (`ui/choose.ts`); and Hermes has no `Intl.PluralRules`, so every plural message failed in the app; the shared formatter falls back to the shipped languages' CLDR rules (`web/src/lib/i18n/format.ts`, checked against `Intl.PluralRules`).

