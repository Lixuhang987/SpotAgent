#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

bash "$PROJECT_ROOT/scripts/swiftw.test.sh"
bash "$PROJECT_ROOT/scripts/package-app.test.sh"

pnpm exec vitest run \
  --exclude ".worktrees/**" \
  apps/agent-server/tests \
  packages/core/tests
