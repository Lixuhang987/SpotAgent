# Frontend Design Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 React ThreadWindow 与 SwiftUI 原生前端统一到根目录 `DESIGN.md` 的 warm-canvas / coral / dark product surface 视觉语言。

**Architecture:** React ThreadWindow 已完成主要重构，本轮只做一致性复核与缺口修补。SwiftUI 原生界面通过 `AppTheme` 承接 DESIGN.md token，再让 PromptPanel、Settings、StatusBubble 消费同一套 token，保留现有 View / ViewModel / Controller 边界和交互行为。

**Tech Stack:** SwiftUI macOS 15+、React + Tailwind、Vitest、SwiftPM 测试、Playwright 视觉复核。

---

### Task 1: Swift Theme Token

**Files:**
- Modify: `apps/desktop/Sources/Theme/AppTheme.swift`
- Modify: `apps/desktop/Sources/Theme/theme.md`
- Test: `apps/desktop/TestsSwift/Theme/AppThemeTests.swift`

- [ ] **Step 1: Write failing tests**

Add tests that assert the default theme exposes DESIGN.md semantics: cream canvas spacing stays stable, radius stays under card limits, and the named semantic colors can be consumed.

- [ ] **Step 2: Run test to verify failure**

Run: `bash ./scripts/swiftw test --filter AppThemeTests`

Expected before implementation: failure for missing `canvas`, `surfaceCard`, `surfaceDark`, `accentTeal`, or equivalent semantic tokens.

- [ ] **Step 3: Implement theme tokens**

Extend `ThemeColors` with DESIGN.md semantic tokens while preserving current field names used by existing views. Map old names to the new palette rather than rewriting every call site at once.

- [ ] **Step 4: Run test to verify pass**

Run: `bash ./scripts/swiftw test --filter AppThemeTests`

Expected: AppTheme tests pass.

### Task 2: SwiftUI Native Surface Restyle

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift`
- Modify: `apps/desktop/Sources/Settings/SettingsView.swift`
- Modify: `apps/desktop/Sources/Settings/SettingsStyles.swift`
- Modify: `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`
- Modify: `apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift`
- Test: existing Swift build and ViewModel tests

- [ ] **Step 1: Restyle PromptPanel**

Use cream panel background, hairline borders, coral selected/active state, and dark text while preserving the current first-row drag behavior and growing text input.

- [ ] **Step 2: Restyle Settings**

Use a cream window background, warm sidebar/tab selection, refined field surfaces, and coral emphasis without changing settings data flow or tab structure.

- [ ] **Step 3: Restyle StatusBubble**

Use a cream floating bubble with coral/teal running state, warm border, and compact typography while preserving `onTapGesture` and non-activating panel behavior.

- [ ] **Step 4: Run Swift verification**

Run: `bash ./scripts/swiftw test` and `bash ./scripts/swiftw build`

Expected: both commands pass.

### Task 3: React Consistency Check

**Files:**
- Inspect/modify as needed: `apps/thread-window-web/src/**`
- Test: `apps/thread-window-web/tests/designTokens.test.ts`

- [ ] **Step 1: Check token alignment**

Verify Tailwind tokens still match `DESIGN.md` and add missing assertions if Swift introduces terminology that should stay mirrored in web docs.

- [ ] **Step 2: Run web tests/build**

Run: `pnpm --filter handagent-thread-window-web test` and `pnpm --filter handagent-thread-window-web build`

Expected: both commands pass.

### Task 4: Documentation and QA

**Files:**
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/Theme/theme.md`
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/Sources/Settings/settings.md`
- Modify: `apps/desktop/Sources/StatusBubble/status-bubble.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Update module docs**

Describe that SwiftUI native surfaces now follow DESIGN.md via Theme token mapping, while React ThreadWindow remains Tailwind-owned.

- [ ] **Step 2: Update manual QA**

Add a manual QA item covering PromptPanel, Settings, StatusBubble, and ThreadWindow visual consistency.

- [ ] **Step 3: Run final verification**

Run: `bash ./scripts/test.sh`, `bash ./scripts/swiftw test`, `bash ./scripts/swiftw build`, `pnpm --filter handagent-thread-window-web test`, and `pnpm --filter handagent-thread-window-web build`.

Expected: all verification commands pass.

- [ ] **Step 4: Commit**

Commit with message: `refactor: unify frontend design language`.
