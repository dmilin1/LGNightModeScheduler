## Add Night Mode Scheduler

A rooted-TV utility for scheduling Eye Comfort Mode (blue light reduction),
with optional day/night pixel brightness values and temporary manual controls.

- Source: https://github.com/dmilin1/LGNightModeScheduler
- License: MIT
- Requires root and Homebrew Channel
- Default window: 21:00–06:00 in the TV's local timezone
- Startup hook is a symlink into the service container; a missing target is inert
- No writes to system partitions and no network listener or remote dependencies

### Testing

Tested on LG OLED65C1PUB, firmware 03.53.45, webOS 6.5.3-47, Node.js 8.12.0.
The maintainer confirmed that human code review and acceptance testing passed,
including physical-remote controls, cold boot/wake recovery, overnight 9 PM and
6 AM transitions, and the input/picture modes used on this TV.

See `docs/TESTING.md` for automated coverage and instrumented hardware results.
Other TV models/releases have not been verified.

### AI disclosure

Codex assisted substantially with implementation and automated testing.
Human review and acceptance testing: **completed**, as confirmed by the maintainer.
The maintainer remains responsible for the code and the submission.
