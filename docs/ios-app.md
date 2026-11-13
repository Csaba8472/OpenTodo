---
title: The iOS app
summary: The native OpenTodo app for iPhone and iPad: offline tasks, sign-in, widgets, sharing, reminders and biometric unlock.
audience: user
section: Reference
specs: []
screens: []
order: 23
---
# The iOS app

OpenTodo 2.0 is the native app for iPhone and iPad. It requires iOS 16.4 or later. It keeps tasks on the device and syncs with your own server, so lists, capture and edits work offline. It is being tested before replacing the current App Store app. The [1.x web-view app guide](ios-webview-app.md) describes the version currently available from the store.

## Install and sign in

The app uses the existing [App Store record](https://apps.apple.com/us/app/opentodo/id6832200428). Trial builds reach testers through TestFlight; the production switch follows testing and release approval.

Enter your server address and choose **Continue**. The system's sign-in sheet opens your server, where password, passkeys, two-factor and single sign-on work as on the web. If the browser is already signed in, confirm the app sign-in. The app keeps its own tokens in secure storage; revoke them from your server's sessions list.

Use an OpenTodo 1.4 or newer server. HTTPS is recommended; an address on your local network can use explicitly entered HTTP. The app does not bypass untrusted certificates.

When updating from 1.x, the server address is filled in, and you sign in once more. The first sync restores the account. The last 1.x release sends pending changes before showing the update notice; the new app does not import a web view's local database.

## Lists, capture and offline use

The five destinations are Today, Inbox, Upcoming, Browse and Search. Tap a task to edit it; tap its circle or swipe right to complete it, with Undo in the message. Browse contains projects, labels, saved views, notes, the Logbook and Settings. [The app guide](app.md) covers capture, dates, gestures and task detail.

After the first sign-in, the app starts offline with its local account. Changes wait in the outbox until a connection returns. Settings and planning features not yet present in the native app open on your server through **Settings → Open on the web**.

## Widgets

Add **Today** from the home-screen widget gallery, then open the app once. It shows today's and overdue tasks from the device's last publication. Completing a task updates it; a change on another device appears after sync or background refresh. Tap a task to open it.

A snapshot more than an hour old shows **Updated** with its publication time. An encrypted account publishes titles only while unlocked; a locked publication contains counts only. The widget makes no requests of its own.

## Sharing

Choose OpenTodo in another app's share sheet to send text, a link or images. The app turns the share into an Inbox task when it opens or returns to the foreground. Files remain on the device until their upload succeeds, and a share waiting for an encrypted account stays queued until unlock. The share sheet accepts up to ten files, 20 MB each and 25 MB together; your server can impose a lower limit.

## Reminders and background refresh

Reminders are local notifications, scheduled from the shared reminder rules. The app keeps the next 60 within the scheduling window, leaving room under iOS's 64-notification limit. Changes and syncs reschedule them, and background refresh tops them up. **Complete** and **Snooze 10 min** write changes on the device and send them at the next sync.

Allow notifications in iOS Settings. The app uses no push relay. iOS decides when background refresh runs, which can mean minutes or hours; refresh is not guaranteed after a force quit. A mention or assignment from someone else is delivered at the next refresh or when the app opens, rather than instantly. A reminder changed while the phone was offline keeps its old schedule until the next sync.

## Encrypted accounts

The passphrase unlocks an encrypted account after a cold start. After unlocking, you can enable Face ID or Touch ID on a device that supports it. The saved key requires biometric authentication and stays in device-only secure storage. The passphrase remains available; changing biometric enrollment invalidates the saved key and brings back the passphrase prompt.

Signing out removes the account's local data, tokens, queued shares, widget publication and scheduled notifications. Your server keeps the account.

## iPad

At regular width, the native app places Browse, the current list and task detail beside one another. A narrow multitasking window uses the phone layout. A pointer highlights rows; a task can be dragged onto a sidebar project.

With a hardware keyboard, **N** opens capture, **⌘F** opens search, **Space** completes the selected task, **⌘1–5** switches destinations and **↑/↓** moves through the list. Text editing keeps its normal keys.

## Building it

The native source is `mobile/app`. Its generated Xcode project includes the widget and share extension under `mobile/app/targets`; `mobile/ios` remains the 1.x shell until the production switch. See [mobile/README.md](../mobile/README.md) for the pinned toolchain, prebuild and simulator commands. A build for your own Apple account needs your own bundle identifier and signing configuration.

As the copyright holder, the author permits distribution through the App Store and TestFlight. The source remains AGPL-3.0.
