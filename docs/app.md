---
title: The OpenTodo app
summary: The native OpenTodo app for Android and iPhone: sign in to your server, the five tabs, the gestures, capture, a task's detail, offline use and encrypted accounts.
audience: user
section: Reference
specs: []
screens: []
order: 21
---
# The OpenTodo app

The OpenTodo app draws its screens with your phone's own parts: the tab bar, lists that scroll like the phone's, sheets, menus and the system's date picker. It keeps your tasks on the phone and syncs them with your own server, so it works without a connection and sends your changes when it has one. It is in trial; the [Android app](android-app.md) and the iPhone app you install today show the web app instead.

## Sign in

Enter your server's address and pick **Continue**. Your server's sign-in page opens in the phone's own sign-in sheet, so your password, two-factor, passkeys and single sign-on work as on the web; if that browser is signed in already, you only confirm "Sign in to the OpenTodo app on Android?" (or on iPhone). The app keeps its own tokens in the phone's secure storage and appears with your sessions in **Settings → Account** on the web, where you can sign it out.

The server needs app sign-in (OpenTodo 1.4 or later). A home server without a certificate works on the local network over plain `http`.

## The tabs

| Tab | What it shows |
| --- | --- |
| Today | What is due today, with Earlier on top, then This Evening and the tasks waiting on another |
| Inbox | Tasks with no project and no date; its tab shows how many |
| Upcoming | The next 14 days, one section per day |
| Browse | Projects (with their sections), labels, saved views, Notes, the Logbook and Settings |
| Search | Tasks and notes on the phone, found as on the web, offline too |

## Gestures

| Do this | To |
| --- | --- |
| Tap a task | Open its detail; swipe from the edge (or Back) to return |
| Tap its circle, or swipe it all the way right | Complete it; Undo in the message brings it back |
| Swipe left | Schedule or Delete (in the Inbox: Schedule or Move) |
| Long-press | The task's menu: Schedule, Move, Priority, Labels, Duplicate, Copy link, Delete |
| Pull down | Sync now |
| Select | Pick several tasks, then Complete, Schedule, Move or Delete them together; in a project, drag a task by its handle to another place |

Every swipe is also an action of the row for VoiceOver and TalkBack.

## Adding a task

The add button (the round button on Android, **+** at the top on iPhone) opens the capture sheet with the keyboard up. Type the way you say it, `Call Anna tomorrow 9am #Work p1`: the date, project, labels and priority are recognised as you type and shown as chips; tap a chip to keep that part as text. The buttons under the field set the date, project, labels and priority by tap. **Add** (or Return) adds the task and keeps the sheet open for the next one. A task added from Today is due today, one added from a project goes there, one added from a label carries it, unless what you typed says otherwise.

## A task's detail

The title and the notes are edited in place, and every change is saved at once. Notes are written in Markdown; a change made on the web at the same time is merged with yours. The rows below show what is set (When, Deadline, Project, Labels, Priority, Repeat); **Add…** sets the others. Then come the subtasks, the attachments and the comments.

The date sheet offers Today, Tomorrow, This weekend, Next week and No date, a line where you can type a date (`next fri 3pm`), the phone's calendar and clock, and Repeat with common rules or one you type.

## Offline

Everything above works without a connection. The top of a list says **Offline** with the time of the last sync, and your changes are sent when the connection returns.

## Encrypted accounts

An account with [end-to-end encryption](e2ee.md) asks for its passphrase after sign-in and each time the app starts. The key stays in the app's memory only.

## What stays on the web

Settings beyond the account, the appearance and sign-out, and the planning screens (calendar, boards, Plan, automations) are on the web: **Settings → Open on the web** opens your server in the phone's browser.

## Signing out

**Browse → Settings → Sign out** ends the app's session on the server and removes the account's tasks, tokens and settings from the phone; they stay on your server.
