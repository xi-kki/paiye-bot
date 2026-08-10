#!/usr/bin/env bash
# Runs paiye.js until the workflow job is cut, restarting it on crash, and
# commits back bot state (subscribers.json, applications.json) every 10 min so
# it survives the ephemeral runner. One run exists at a time (workflow uses
# cancel-in-progress), so push conflicts cannot realistically occur.
set -u

cd "$GITHUB_WORKSPACE"

git config user.name "paiye-bot"
git config user.email "paiye-bot@users.noreply.github.com"

sync_state() {
  git add -A || true
  if ! git diff --cached --quiet; then
    git commit -m "state: $(date -u +%Y%m%dT%H%M%SZ)" >/dev/null 2>&1 || true
    git pull --rebase origin master >/dev/null 2>&1 || true
    git push origin master >/dev/null 2>&1 || true
  fi
}

# Pick up state pushed by the previous cycle before polling starts.
git pull --rebase origin master >/dev/null 2>&1 || true

while true; do
  node paiye.js &
  BOT_PID=$!
  while kill -0 "$BOT_PID" 2>/dev/null; do
    sleep 600
    sync_state
  done
  sync_state
  wait "$BOT_PID"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    break
  fi
  sleep 10 # crash-restart
done
