#!/bin/sh
# Keeps one headless browser from hurting the machine. Runs as its own process, so it still works if
# the tool that started the browser is killed outright (SIGKILL can't be caught from inside).
#   guard.sh <tool pid> <browser pid = its process group> <profile dir> <max seconds> <max MB>
# Stops the browser when: the tool has gone, time is up, the browser's group uses more than max MB
# (top's MEM, which counts compressed pages; ps RSS doesn't, and that hid a 47 GB helper), or the
# whole machine is short (under 20% free, or swap has grown 1.5 GB since this run began: idle apps' old swap isn't this run's doing). Logs each run to out/guard.log.
TOOL=$1; GROUP=$2; PROFILE=$3; MAXS=$4; MAXMB=$5
LOG=out/guard.log; START=$(date +%s); PEAK=0; WHY=
SWAP0=$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9]+).*/\1/')
while :; do
  sleep 3
  kill -0 "$GROUP" 2>/dev/null || { WHY=finished; break; }
  kill -0 "$TOOL" 2>/dev/null || { WHY="tool gone"; break; }
  NOW=$(date +%s); [ $((NOW - START)) -gt "$MAXS" ] && { WHY="over ${MAXS}s"; break; }
  MB=$(top -l 1 -stats pgrp,mem | awk -v g="$GROUP" '$1 == g { m = $2; gsub(/[+-]/, "", m); v = m + 0; if (m ~ /G/) v *= 1024; else if (m ~ /K/) v /= 1024; else if (m ~ /B/ && m !~ /M/) v = 0; s += v } END { printf "%d", s }')
  [ "$MB" -gt "$PEAK" ] && PEAK=$MB
  [ "$MB" -gt "$MAXMB" ] && { WHY="browser ${MB} MB over ${MAXMB}"; break; }
  FREE=$(sysctl -n kern.memorystatus_level)
  [ "$FREE" -lt 20 ] && { WHY="machine at ${FREE}% free"; break; }
  SWAP=$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9]+).*/\1/')
  [ "$SWAP" -gt $((SWAP0 + 1536)) ] && { WHY="swap grew to ${SWAP} MB from ${SWAP0}"; break; }
done
kill -9 -"$GROUP" 2>/dev/null
rm -rf "$PROFILE"
echo "$(date '+%F %T') tool=$TOOL peak=${PEAK}MB free=$(sysctl -n kern.memorystatus_level)% took=$(( $(date +%s) - START ))s end=$WHY" >> "$LOG"
case "$WHY" in finished|"tool gone") ;; *) echo "GUARD STOPPED THE BROWSER: $WHY" >&2; kill -TERM "$TOOL" 2>/dev/null ;; esac
