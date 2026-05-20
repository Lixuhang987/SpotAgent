#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

bash "$PROJECT_ROOT/scripts/swiftw.test.sh"
bash "$PROJECT_ROOT/scripts/package-app.test.sh"

pnpm exec vitest run \
  apps/agent-server/src/MessageTranslator.test.ts \
  apps/agent-server/src/SessionPersistence.test.ts \
  apps/agent-server/src/SessionPermissionBridge.test.ts \
  apps/agent-server/src/SessionRuntimeOrchestrator.test.ts \
  apps/agent-server/src/SessionRouter.test.ts \
  apps/agent-server/src/SettingsBackedLLMClient.test.ts \
  apps/agent-server/src/WebSocketPlatformBridge.test.ts \
  apps/agent-server/src/server.test.ts \
  apps/agent-server/src/path-alias.test.ts \
  packages/core/tests
