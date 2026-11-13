## ADDED Requirements

### Requirement: Focus in the native app
The native app SHALL use the shared Focus modes, preferences and transitions, keep its timer state local to the device and write the session's time entries through the operation log. Its controller SHALL publish the full state to the shared-container module after start, pause, resume, phase change, end, task change, Take a break, leaving the screen and restoring a stored session. It SHALL publish none on sign-out, on encryption lock and when no session is stored. Titles SHALL be omitted for encrypted accounts and when the device disallows them. Publishing SHALL write no op and send no timer state to the server. The web app's Focus screen and service-worker notification SHALL behave as before.

#### Scenario: Native offline session
- **WHEN** the user starts Focus on a task in the native app without a network
- **THEN** the session runs locally and its time-entry ops wait for sync

#### Scenario: Browser unchanged
- **WHEN** a session runs in a browser tab
- **THEN** no Expo module is called and its existing notification behavior is preserved

### Requirement: Native Focus actions
The native app SHALL handle `opentodo://focus?action=pause` and `opentodo://focus?action=resume` through the same controller transitions as its screen controls, after the account is ready. A stale action SHALL do nothing. The action SHALL be consumed after handling and SHALL NOT replay when the screen or app is restored.

#### Scenario: Pause from the activity
- **WHEN** the activity opens the Pause link during a running session
- **THEN** the native Focus screen opens, the session pauses, its time entry stops through ops and the new state is published

#### Scenario: Stale action
- **WHEN** the Pause link opens while already paused
- **THEN** no state change or additional op is written

### Requirement: One native session-end notification
The native app SHALL schedule session-end and break-end notifications through the native module only, cancel and reschedule on transitions, and never invoke a service-worker notification. Browsers SHALL keep their existing service-worker notifications.

#### Scenario: Native session end
- **WHEN** a native session reaches its planned end in the background
- **THEN** one local Session done notification is shown

#### Scenario: Browser session end
- **WHEN** a browser session reaches its planned end while hidden with notifications allowed
- **THEN** its existing service-worker notification is shown
