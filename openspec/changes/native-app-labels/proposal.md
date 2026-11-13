# Proposal

## Why

The native app lists labels under Browse and shows a label's tasks, but a label can only be renamed or deleted in the web app. A typo or a label no longer used means opening a browser.

## What Changes

- **Rename and delete on the phone.** A long press on a label in Browse opens its actions: **Rename** and **Delete label…**. Both are also accessibility actions of the row, so TalkBack and VoiceOver users reach them without the gesture.
- **Rename** opens a sheet with the name; a name another label has is refused with the web's message and nothing changes.
- **Delete** asks first, saying how many tasks lose the label; the tasks stay. The writes are the shared `updateLabel` and `deleteLabel` (`web/src/lib/labels.ts`), so the web and the phone behave the same, offline included.
- The strings are the web's, so all seven languages are translated.

## Capabilities

### Modified Capabilities

- `native-app`: labels can be renamed and deleted in the app.

## Out of scope

Recolouring, reordering and merging labels, and creating a label other than from capture, stay in the web app.

## Roadmap

Part of the "Native app" area, after `native-app-everyday`.
