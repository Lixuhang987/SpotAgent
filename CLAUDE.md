# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# TypeScript tests (agent-server + core, vitest)
bash ./scripts/test.sh

# Swift tests and build (desktop app)
bash ./scripts/swiftw test
bash ./scripts/swiftw build

# Run desktop app
bash ./scripts/swiftw run HandAgentDesktop

# Install workspace dependencies
pnpm install
```

All three verification commands (`test.sh`, `swiftw test`, `swiftw build`) must pass before committing. Swift commands use `scripts/swiftw` wrapper which caches builds in `.cache/swift/` to avoid user directory pollution. Swift tests fail under zsh hook environments (sandbox restriction) — run them manually in the current shell.

## Architecture

HandAgent is a macOS desktop Agent Runtime — a global-hotkey-activated AI assistant. Layered architecture:

```
apps/desktop (Swift/SwiftUI macOS host)
    ↓ WebSocket
apps/agent-server (local session bridge, TypeScript)
    ↓
packages/core (cross-platform Agent Core, TypeScript)
    ↓
packages/platform-macos (macOS platform implementation, TypeScript)
```

Call flow: hotkey → PromptPanel → user submits prompt → SessionWindow + WebSocket client → agent-server → AgentRuntime → LLMClient → tool calls loop → results stream back to SessionWindow.

## Key Boundaries

- `packages/core/` is cross-platform — no macOS imports, no UI dependencies.
- `packages/platform-macos/` exposes macOS capabilities only through `PlatformAdapter` interface.
- LLM provider accessed only through `LLMClient` abstraction (never hardcode a provider in runtime).
- Only user input and user-selected text can be initial context. Screen/window/file/clipboard/app state must be read via tools, not pre-injected.

## Conventions

- Documentation is written in Chinese by default. English only for API fields, protocol names, or industry terms.
- Tool names use dot notation: `file.read`, `screen.capture`, `app.frontmost`.
- Target platform: macOS 15+ only. No `if #available` fallbacks for older systems.
- Prefer native macOS APIs (ScreenCaptureKit, Accessibility, NSWorkspace) over osascript.
- Model settings live in `~/.spotAgent/settings.json` (read on each request, no restart needed).

## Development Workflow

- 需要修改代码的任务，必须先使用 `EnterWorktree` 创建 worktree（目录 `.worktrees/<task-name>/`），并在 worktree 中运行 `pnpm install` + 基线验证（`bash ./scripts/test.sh` 和 `bash ./scripts/swiftw build`）通过后，再开始实际代码修改。纯文档任务不需要 worktree。
- Update existing docs after code changes.
- Commit with descriptive message; don't leave completed work uncommitted.

## Internal Docs

Architecture docs are co-located with their modules (e.g., `packages/core/core.md`, `apps/desktop/desktop.md`). Read the `.md` file with the same name as the target folder before modifying that area.
