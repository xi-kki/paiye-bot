#!/usr/bin/env bash
# Paiye 24/7 on GitHub Actions (public repo = free runner minutes, no card).
# All bot state (subscribers, applications, resumes, audits) lives in the
# PRIVATE repo xi-kki/paiye-bot-state, cloned into .state/ and symlinked into
# the workspace. Nothing user-facing is ever committed to the public repo.
set -u

cd "$GITHUB_WORKSPACE"

STATE_REPO="https://x-access-token:${GH_PAT}@github.com/xi-kki/paiye-bot-state.git"
STATE_FILES="subscribers.json applications.json userData.json compliance-violations.json admin-audit.json blocked-users.json"

git config user.name "paiye-bot"
git config user.email "paiye-bot@users.noreply.github.com"

# ── state repo ──────────────────────────────────────────────
if [ -d .state/.git ]; then
  git -C .state config user.name "paiye-bot"
  git -C .state config user.email "paiye-bot@users.noreply.github.com"
  git -C .state pull --rebase -q origin master || true
else
  rm -rf .state
  git clone -q "$STATE_REPO" .state || { echo "state clone failed"; exit 1; }
  git -C .state config user.name "paiye-bot"
  git -C .state config user.email "paiye-bot@users.noreply.github.com"
fi

for f in $STATE_FILES; do
  [ -f ".state/$f" ] || printf '{}\n' > ".state/$f"
done
mkdir -p .state/uploads

# ── symlink farm: bot writes __dirname-relative files → .state ──
for f in $STATE_FILES; do
  ln -sfn ".state/$f" "$f"
done
rm -rf uploads
ln -sfn ".state/uploads" uploads

# ── seed push (no-op on later runs) ──
git -C .state add -A || true
git -C .state commit -q -m "seed $(date -u +%Y%m%dT%H%M%SZ)" || true
git -C .state push -q origin master || true

sync_state() {
  git -C .state add -A || true
  if ! git -C .state diff --cached --quiet; then
    git -C .state commit -q -m "state: $(date -u +%Y%m%dT%H%M%SZ)" || true
    git -C .state pull --rebase -q origin master || true
    git -C .state push -q origin master || true
  fi
  # 1 commit/day in the public repo keeps the scheduled workflow enabled
  # (GitHub auto-disables scheduled workflows after 60d of repo inactivity).
  if [ "$(cat .keepalive 2>/dev/null)" != "$(date -u +%Y-%m-%d)" ]; then
    date -u +%Y-%m-%d > .keepalive
    git add .keepalive
    git commit -q -m "keepalive $(date -u +%Y-%m-%d)" || true
    git push -q origin master || true
  fi
}

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
  if [ "$rc" -eq 0 ]; then break; fi
  sleep 10 # crash-restart
done
