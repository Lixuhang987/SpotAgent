#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

pnpm exec vitest run \
  apps/agent-server/src/SessionManager.test.ts \
  apps/agent-server/src/SettingsBackedLLMClient.test.ts \
  apps/agent-server/src/WebSocketPlatformBridge.test.ts \
  packages/core/tests/model-settings.test.ts \
  packages/core/tests/openai-config.test.ts \
  packages/core/tests/runtime.test.ts \
  packages/core/tests/selection.test.ts \
  packages/core/tests/context-tools.test.ts \
  packages/core/tests/file-tools.test.ts \
  packages/core/tests/file-session-store.test.ts \
  packages/core/tests/vercel-client.test.ts \
  packages/core/tests/workspace-registry.test.ts \
  packages/core/tests/register-builtins.test.ts \
  packages/core/tests/tool-settings.test.ts
