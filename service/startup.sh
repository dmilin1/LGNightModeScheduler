#!/bin/sh
# Homebrew boot hook. Return promptly so other startup hooks can run.
SERVICE=/media/developer/apps/usr/palm/services/io.github.dmilin1.nightmodescheduler.service
[ -f "$SERVICE/service.js" ] || exit 0
(
  for attempt in 1 2 3 4 5 6; do
    result=$(luna-send -n 1 -w 10000 luna://io.github.dmilin1.nightmodescheduler.service/start '{}')
    printf '%s\n' "$result"
    printf '%s' "$result" | grep -q '"returnValue":true' && exit 0
    sleep 5
  done
) </dev/null >/var/lib/webosbrew/night-mode-scheduler-startup.log 2>&1 &
exit 0
