#!/bin/bash
# Make a fresh Claude Code on the web container able to run this project's
# checks. The container is ephemeral and the repo is cloned clean, so without
# this the first `npm test` in a session fails on a missing node_modules and
# the session spends its opening minutes on setup instead of the task.
#
# Local machines already have their dependencies, so this does nothing there.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Everything below goes to stderr on purpose. This hook is synchronous, and a
# synchronous SessionStart hook's STDOUT is fed into the session as context —
# so an unredirected `npm install` would open every single session with a few
# hundred lines of dependency chatter the model then has to read past.
{
  # `install` rather than `ci`: the container image is cached after this hook
  # finishes, and install can reuse what is already there. The lockfile is
  # committed, so the resolved tree is the same either way.
  npm install --no-audit --no-fund

  # Playwright's browsers are pre-installed in this image and
  # PLAYWRIGHT_BROWSERS_PATH points at them, so there is deliberately no
  # `playwright install` here — it would re-download ~150MB already on disk.
  # What IS worth doing is telling the session where they are, since the e2e
  # drives take the path from the environment.
  if [ -x /opt/pw-browsers/chromium ]; then
    echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "${CLAUDE_ENV_FILE:-/dev/null}"
  fi
} >&2

echo "ClueCabulary: dependencies installed. Checks: npm run verify (or typecheck / test / build / drives)."
