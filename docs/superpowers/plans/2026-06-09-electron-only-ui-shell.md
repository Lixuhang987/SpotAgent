# Electron-only UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy Swift WKWebView ThreadWindow, Swift StatusBubble, and Swift-owned agent-server default path so production desktop always uses Electron for ThreadWindow, ActivityWindow, and agent-server supervision.

**Architecture:** Swift remains the macOS host for PromptPanel, Settings, hotkeys, focus restoration, platform capability IPC, and the Swift-to-Electron command bridge. Electron main is the only production owner of ThreadWindow, StatusBubble ActivityWindow, and agent-server supervision. React renderers keep `/api/thread` and `/api/activity`; Swift only keeps `/api/platform`.

**Tech Stack:** SwiftPM macOS app, SwiftUI/AppKit host, Electron main/preload/React ActivityWindow, Vitest, Swift XCTest.

---

### Task 1: Make AppServices Electron-only

**Files:**
- Modify: `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- Delete: `apps/desktop/Sources/AppServices/AgentServer/AgentActivityConnectionClient.swift`
- Delete: `apps/desktop/Sources/AppServices/AgentServer/AppServer.swift`
- Replace: `apps/desktop/Sources/AppServices/AgentServer/AgentServerService.swift` with repository-root locator only

- [ ] **Step 1: Write failing AppServices tests**

Add or update tests to assert `defaultRuntime(environment: [:], platformServerURL:)` returns `ElectronBackedAppServer` for `appServer`, `threadWindowCommandClient`, and `activityWindowCommandClient`; remove tests that expect `HANDAGENT_ELECTRON_SHELL` to select Electron.

- [ ] **Step 2: Run test to verify failure**

Run: `bash ./scripts/swiftw test --filter AppServicesTests`

Expected: failure because current `defaultRuntime` still returns the legacy `AppServer` when `HANDAGENT_ELECTRON_SHELL` is absent.

- [ ] **Step 3: Implement minimal AppServices change**

Remove `activityServerURL`, `threadWindowWebAppURL`, `threadWindowPresenter`, and `showsStatusBubble` from production DI. Make `defaultRuntime` always build `ElectronShellProcess` and `ElectronBackedAppServer`; keep `AppServerManaging`, `PlatformBridgeConnectionClient`, and `NopAppServer` for health tests and test injection.

- [ ] **Step 4: Run test to verify pass**

Run: `bash ./scripts/swiftw test --filter AppServicesTests`

Expected: pass.

### Task 2: Remove Swift ThreadWindow and StatusBubble coordination

**Files:**
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift`
- Delete: `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift`
- Delete: `apps/desktop/Sources/ThreadWindow/ThreadWindowWebHost.swift`
- Delete: `apps/desktop/Sources/ThreadWindow/ThreadWindowWebView.swift`
- Delete: `apps/desktop/Sources/StatusBubble/StatusBubbleController.swift`
- Delete: `apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift`
- Delete: `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`
- Delete: `apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift`

- [ ] **Step 1: Write failing Coordinator tests**

Remove default StatusBubble tap tests and fallback-to-Swift-StatusBubble assertions. Add assertions that unavailable or failed ActivityWindow commands do not create Swift StatusBubble windows and that `prompt_panel.show_requested` still opens PromptPanel.

- [ ] **Step 2: Run test to verify failure**

Run: `bash ./scripts/swiftw test --filter AppCoordinatorTests`

Expected: failure because current Coordinator still owns `StatusBubbleController` and still falls back to Swift StatusBubble.

- [ ] **Step 3: Implement minimal Coordinator change**

Remove `statusBubbleTapped`, `setupStatusBubble`, `handleStatusBubbleTap`, `statusBubbleController`, and all Swift StatusBubble fallback calls. Construct `ElectronThreadWindowLifecycle` from required `ThreadWindowCommanding`; remove the WKWebView lifecycle branch. Make `ThreadWindowManaging.webHost` obsolete by deleting it or making callers not expose it.

- [ ] **Step 4: Run test to verify pass**

Run: `bash ./scripts/swiftw test --filter AppCoordinatorTests`

Expected: pass.

### Task 3: Clean legacy Swift tests and remaining compile references

**Files:**
- Delete: `apps/desktop/TestsSwift/ThreadWindow/ThreadWindowWebHostTests.swift`
- Delete: `apps/desktop/TestsSwift/Coordinator/ThreadWindowLifecycleTests.swift`
- Delete: `apps/desktop/TestsSwift/StatusBubble/StatusBubbleViewModelTests.swift`
- Modify: `apps/desktop/TestsSwift/HandAgentAppTests.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AgentServer/AppServerConnectionTests.swift`
- Modify: any Swift test helper still referencing `ThreadWindowPresenting`, `ThreadWindowWebHost`, `activityServerURL`, `threadWindowWebAppURL`, or `showsStatusBubble`

- [ ] **Step 1: Run focused Swift tests**

Run: `bash ./scripts/swiftw test --filter AppServicesTests && bash ./scripts/swiftw test --filter AppCoordinatorTests && bash ./scripts/swiftw test --filter ElectronThreadWindowLifecycleTests`

Expected: pass after deleting old tests and updating helpers.

- [ ] **Step 2: Run Swift build**

Run: `bash ./scripts/swiftw build`

Expected: pass with no references to deleted Swift WKWebView or StatusBubble types.

### Task 4: Update architecture docs and manual QA

**Files:**
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/sources.md`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Modify: `apps/desktop/Sources/AppServices/AgentServer/agent-server.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/electron-shell/electron-shell.md`
- Modify: `docs/superpowers/specs/2026-06-08-electron-ui-shell-migration.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Replace feature-flag wording**

Update docs so Electron shell is the default and only production UI shell. Remove references to default Swift WKWebView ThreadWindow, default Swift StatusBubble, and `HANDAGENT_ELECTRON_SHELL`.

- [ ] **Step 2: Record manual QA needs**

Add a manual QA entry for Electron-only packaged mock app: launch app, wait for Electron ready/prewarmed ThreadWindow, submit prompt, verify Electron ThreadWindow, verify Electron ActivityWindow `/api/activity`, verify PromptPanel fallback when no visible ThreadWindow, verify shutdown cleans Electron and agent-server.

### Task 5: Full verification and commit

**Files:**
- All modified files

- [ ] **Step 1: Run full verification**

Run:

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run document audit**

Dispatch the required independent documentation audit for the completed spec, ensuring related `<dir>.md` files and `docs/manual-qa.md` match code.

- [ ] **Step 3: Commit**

Run:

```bash
git status --short
git add <changed files>
git commit -m "refactor: make desktop electron ui shell only"
```
