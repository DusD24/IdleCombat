#!/usr/bin/env bash
# Record the Fire tablet screen in back-to-back 3-minute clips into footage/.
# Stop with:  touch footage/STOP   (finishes the current clip, then exits)
set -u
ADB=${ADB:-/opt/homebrew/share/android-commandlinetools/platform-tools/adb}
OUT="$(cd "$(dirname "$0")/.." && pwd)/footage"
mkdir -p "$OUT"; rm -f "$OUT/STOP"
LOG="$OUT/session.log"
i=0
while [ ! -f "$OUT/STOP" ]; do
  i=$((i+1))
  name="clip_$(date +%Y%m%d_%H%M%S).mp4"
  start=$(date +%s)
  echo "$(date '+%F %T') start $name focus: $($ADB -d shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus | sed 's/.*u0 //;s/}//')" >> "$LOG"
  # 1200x1920 is native; screenrecord caps at 180s per clip
  $ADB -d shell screenrecord --time-limit 180 --bit-rate 8000000 "/sdcard/$name" || { echo "$(date '+%F %T') screenrecord failed" >> "$LOG"; sleep 3; }
  sleep 1
  if $ADB -d pull "/sdcard/$name" "$OUT/$name" >/dev/null 2>&1; then
    $ADB -d shell rm -f "/sdcard/$name"
    echo "$(date '+%F %T') saved $name ($(( $(date +%s) - start ))s, $(du -h "$OUT/$name" | cut -f1))" >> "$LOG"
  else
    echo "$(date '+%F %T') pull failed for $name (device unplugged?)" >> "$LOG"
    $ADB -d get-state >/dev/null 2>&1 || break
  fi
done
echo "$(date '+%F %T') stopped after $i clip(s)" >> "$LOG"
