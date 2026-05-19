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
  packages/core/tests/llm-integration-artifacts.test.ts \
  packages/core/tests/llm-client-factory.test.ts \
  packages/core/tests/mock-llm-client.test.ts \
  packages/core/tests/model-settings.test.ts \
  packages/core/tests/openai-config.test.ts \
  packages/core/tests/runtime.test.ts \
  packages/core/tests/blob-store.test.ts \
  packages/core/tests/stub.test.ts \
  packages/core/tests/turn-summarizer.test.ts \
  packages/core/tests/selection.test.ts \
  packages/core/tests/context-tools.test.ts \
  packages/core/tests/file-tools.test.ts \
  packages/core/tests/plugin-tools.test.ts \
  packages/core/tests/file-session-store.test.ts \
  packages/core/tests/vercel-client.test.ts \
  packages/core/tests/workspace-registry.test.ts \
  packages/core/tests/register-builtins.test.ts \
  packages/core/tests/tool-settings.test.ts \
  packages/core/tests/workspace-list-tool.test.ts \
  packages/core/tests/permission.test.ts \
  packages/core/tests/file-permission-policy.test.ts \
  packages/core/tests/file-network-logger.test.ts \
  packages/core/tests/logging-fetch.test.ts
