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

See `docs/TESTING.md` for automated coverage and hardware results. Complete
human TV testing and code review before opening this submission. Record the
TV model, firmware, webOS release, and results honestly in the upstream template.

### AI disclosure

Codex assisted substantially with implementation and automated testing.
Human development/review: **pending**.
Do not mark the upstream human-review checklist complete until it is complete.
