# Testing record

## Automated scheduler tests

Run `npm test` with Node.js 20 or newer. The TV's production code is written for
Node 8; the development test runner runs on modern Node.

17 tests cover overnight/same-day/midnight windows, exact endpoints, Pacific
daylight-saving changes for the default window, numeric brightness 0→100,
startup catch-up, idempotent polling, manual overrides, external remote changes,
disabled scheduling, invalid settings, failed writes, false API success,
input/profile changes, persistence, concurrent commands, and clock reversal.

Browser preview checks passed at 1920×1080 and 1280×720: blue light controls,
brightness adjustment, schedule save/discard, startup controls, arrow/OK
navigation, Back behavior, and horizontal layout. Preview uses simulated
settings and is explicitly labeled; it is not evidence of TV API compatibility.

## Hardware under test

- LG OLED65C1PUB
- Firmware 03.53.45
- webOS 6.5.3-47 (kisscurl-koli)
- Node.js v8.12.0
- Homebrew Channel with root access
- TV local timezone: Pacific (PST during this test)

## Hardware checks

Initial testing on 2026-11-08 confirmed:

- IPK installation and app launch on the TV.
- 1920×1080 TV rendering; all three panels and the footer fit on one screen.
- Blue light reduction on and off through the app, verified using actual
  `getSystemSettings` readback.
- Manual pixel brightness 100→95→100, with actual readback.
- Resume schedule clears the manual override.
- Elevated service runs as root, and startup is an executable symlink into
  the service container.
- With the UI closed (LG Home in the foreground), a temporary 19:28–19:29
  schedule automatically applied blue light on / brightness 0 at 19:28:06,
  then blue light off / brightness 100 at 19:29:06. The subsequent status
  requests confirmed these already-recorded application times.
- Default 21:00–06:00 schedule was restored with brightness scheduling off,
  both stored brightness values 100, and no override.
- After terminating only this service, its boot hook returned promptly and
  restarted it as root, preserving config and returning valid live status.
- Uninstall removed the service and stopped its process. The leftover startup
  symlink became non-executable/inert. Reinstallation and first launch elevated
  the service successfully without any manual permission intervention.

TV testing found and fixed two issues not visible in a modern desktop browser:

1. webOS file origins needed explicit `file:` permission for local scripts,
   styles, and images in the app's CSP.
2. The webOS 6 picture service denied the JS service's bus identity even after
   elevation. The driver now uses root `luna-send` through `execFile`, with
   literal JSON arguments, timeouts, and independent readback verification.

Chromium 79 does not support flex gap; explicit spacing is used for those rows.

Reinstall testing also caught Windows packaging losing the POSIX execute bit
on `startup.sh`. The builder now normalizes that one file to mode 0755 inside
the IPK, and startup status checks execute permission rather than existence.

## Human review and acceptance testing

The maintainer confirmed that human review and all acceptance tests are
complete and passed on the LG OLED65C1PUB listed above:

- Physical-remote navigation, appearance, and picture-setting controls.
- Source and behavior review, including the code produced with Codex assistance.
- Cold boot/power cycle and standby/Quick Start wake, including missed-transition
  recovery.
- The full overnight schedule, including the 9 PM and 6 AM transitions.
- The input and picture modes used on this TV, including HDR/Dolby Vision where
  applicable.

These are maintainer-reported acceptance results, in addition to the automated
and instrumented hardware checks documented here. Compatibility with other
TV models or webOS releases has not been established by this testing record.

## Remote focus and layout refinement

The TV owner tested physical cursor navigation and blue light toggling, and
reported focus disappearing after pressing OK. The UI temporarily disabled
the focused button while applying settings, causing webOS to blur it.

The blue light switch now stays focusable while a request is pending; duplicate
requests are guarded. Completed actions also restore focus when needed, using
an enabled adjacent control if the original became unavailable. A viewer who
moved focus during a request keeps their new focus.

`npm run test:ui` checks repeated OK toggles, resume, brightness limits, save,
focus moved during a pending request, and collapsed/expanded layouts at both
1920×1080 and 1280×720. These checks run in GitHub Actions as well.

On the physical TV, two consecutive Enter events changed blue light off and
on, returned to the initial setting, and retained `blue-toggle` as the active
element after each response. The revised settings layout was inspected from
a TV-rendered screenshot. The maintainer subsequently confirmed that physical-remote acceptance and
human code review are complete and passed.

## Upgrade recovery (v1.0.2)

Updating from an already-running install exposed webOS restarting the service
with its old jailed identity before its root registration was restored.
The UI now invokes a root preparation helper through Homebrew Channel. It
elevates the registration, then stops only a process whose title exactly
matches this service and whose effective UID is non-root. Healthy root
instances and unrelated processes are left alone.

Three additional tests cover the exact process/UID guard, elevation failure,
and refusal to run without root. The full suite now contains 20 tests.
The 1.0.1→1.0.2 upgrade was tested on the same TV: without manual intervention,
the UI reconnected, the service was running as root, existing settings and
startup preference were preserved, and current picture status read correctly.

This helper is new code after the maintainer's v1.0.0 review. That earlier
confirmation does not attest to human review of the new helper.
