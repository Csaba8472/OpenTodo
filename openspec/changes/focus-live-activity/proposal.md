# Proposal

## Why

A Focus session runs while the phone is in a pocket or face down on the desk. Today the only way to see how much time is left is to unlock the phone and open the app, which defeats the point of focusing. Phone-native timers solve this with the lock screen: a Live Activity and the Dynamic Island on iPhone, and an ongoing notification with a running clock on Android. The research names Live Activities for Focus timers as one of the things a web app can never do on iOS (research §3.1, "OS-Edge Capture Surfaces", and Phase 3 item 2). The native app makes these system surfaces possible.

There is a second, quieter gap. In the current web-view apps, a session that ends while the app is in the background says nothing. focus-mode's "Session end notification" goes through the browser's service worker, and a `WKWebView` (and Android's `WebView`) has no notification API.

## What Changes

- Bring the shared Focus modes and transition semantics into a native screen/controller, since the native app has no Focus screen to publish from yet. Keep its state local and write time entries through the existing ops.
- Add `publishFocus(json)` to the native shared-container Expo module and publish full snapshots from that controller.
- Extend the existing iOS widget target with an ActivityKit Live Activity, lock-screen and Dynamic Island clocks, and Pause/Resume links that open the native Focus screen.
- Add an Android ongoing notification with a system chronometer and the same actions, plus local session-end notifications and exact-alarm fallback.
- Keep the web Focus experience and browser notifications unchanged. No web-view bridge, hidden page, new op, route or mandatory environment variable.

This change depends on `native-app-handover` and does not reintroduce retired shells.

## Out of scope

- Push-updated Live Activities (APNs). The timer runs on the system clock, so no updates are needed while the app sleeps (design D2).
- Buttons that change the session without opening the app. They would need background runtime access to the device's timer state (design D4).
- Starting a session from the lock screen, Siri or a widget. `apple-shortcuts` covers opening the app; starting a timer is a later change.
- Showing another device's session. The timer state stays on the device (focus-mode). `focus-session-readable` makes the running session readable through the API and MCP instead.
- Android 16 "Live Updates" promoted notifications. They can follow once the platform settles.
- A watch app.

ROADMAP: native app system integrations after `native-app-handover`.

## Capabilities

### Modified Capabilities

- `native-app`: the native Focus surface and its system activity/notification, local session-end scheduling and cleanup.
- `focus-mode`: native publication and action behavior while browser behavior stays unchanged.

## Impact

The app, its shared platform-backed Focus controller, Expo module and widget target change. The server, op schema, REST/CLI/MCP, CalDAV and vault do not. Encrypted accounts publish no title. ActivityKit adds about 80 KB and Android system surfaces about 10 KB without a new dependency; the native Focus screen/controller must be measured separately. The browser bundle is unchanged. See design D0 for the required native Focus prerequisite.
