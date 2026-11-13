# Proposal

## Why

On an iPhone, capture happens away from the app. People use Siri while walking, the Action Button, the lock screen, and the Shortcuts app. A web app can reach none of these (research §3.1: "an iOS PWA cannot register Home Screen or Lock Screen Widgets, Siri / Apple Shortcuts (AppIntents)…"). Users of self-hosted competitors end up writing their own Scriptable widgets and `shortcuts://` hacks (research §3.1, ref. 29). #105 asks for exactly this: "widgets and reminders … would be very useful in my workflow".

OpenTodo's native iOS app (`native-app-handover`) is the place where this can live. People who stay on the installed web app need a smaller version of the same thing: a ready-made Shortcut that captures into their server.

## What Changes

- Add App Intents and localised App Shortcuts to the native iOS app: Add task, Open quick add, Open Today and What's on today.
- Queue captures durably in the App Group, then file them through the app's shared quick-add parser and op path, offline too. Locked encrypted accounts wait for unlock. Use an Expo module, not a web-view bridge or a hidden page load.
- Extend the native widget target with quick add, lock-screen widgets and an iOS 18+ Add control, all reading the existing Today snapshot.
- Publish a separate signed Shortcuts pack for browser users: token-free capture by default, optional Quick save with a dedicated full token and an encrypted-account fallback.

The change follows `native-app-handover`. It adds no server API, token scope or mandatory environment variable.

## Out of scope

- Live Activities and the Dynamic Island for Focus: `focus-live-activity`.
- Apple Watch complications and a watch app.
- A Scriptable widget (it is a third-party app; the native widgets cover the need).
- Intents that edit, complete or search existing tasks. They would need the app to answer from the encrypted local store in the background, and they enlarge the native module contract. A later change can add them once the capture path has proven itself.
- Android App Actions and Android Quick Settings tiles.
- A new token scope just for capture. The pack reuses the browser extension's model: a `full` token per device, or no token at all (design D6).

ROADMAP: native app system integrations after `native-app-handover`.

## Capabilities

### Modified Capabilities

- `native-app`: durable external captures, App Intents and additional widget surfaces.
- `share-capture`: the signed Apple Shortcuts pack for browser users.

## Impact

The native app's shared container, background entry point and widget target change. No shell source or JavaScript shell bridge is extended. Captures become ordinary task ops with stable ids, and text on an encrypted account never leaves the device before encryption. The browser pack contacts only the configured server. App growth is estimated at 150 KB; the browser bundle and server binary are unchanged. App Intents and WidgetKit are system frameworks, with no new dependency.

Relates to #105. Depends on `native-app-handover`.
