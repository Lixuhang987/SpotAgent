# PromptPanel Warm Command Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Swift 原生 PromptPanel 落地为符合 `DESIGN.md` 的 Warm Command Sheet，并修复主题重构后 PromptPanel / Settings 仍被旧 `.aqua` 与单主题文档假设约束的问题。

**Architecture:** PromptPanel 仍保持 SwiftUI View + ViewModel + Controller + Styles 边界：View 只消费 ViewModel 状态和 `@Environment(\.appTheme)`，Controller 只处理窗口生命周期、focus、QuickLook 与主题注入。Settings 通过 `SettingsLifecycle` 和 `SettingsWindowPresenting` 增加已打开窗口的 theme refresh 路径，Electron/React theme sync 继续由 `AppearanceThemeService` 和 command bridge 负责。

**Tech Stack:** SwiftUI, AppKit `NSPanel` / `NSWindow`, Swift Observation, XCTest, generated `AppTheme` tokens from `design/tokens.json`, existing `scripts/swiftw` and `scripts/test.sh`.

---

## File Structure

Create:

- No new production module is required.

Modify:

- `apps/desktop/Sources/AppServices/AppServices.swift`: extend `SettingsWindowPresenting` with `updateTheme(_:for:)`; update `NopSettingsWindowPresenter`; keep production/test presenters conforming.
- `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`: update Settings window root view when theme changes; keep AppKit appearance semantics explicit.
- `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`: add `updateTheme(_:)` and call presenter refresh for an already-open Settings window.
- `apps/desktop/Sources/Coordinator/AppCoordinator.swift`: call `settingsLifecycle.updateTheme(...)` inside the existing `AppearanceThemeService.onThemeChange` callback.
- `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`: keep `updateTheme(_:)` as the runtime token injection path; if keeping `.aqua`, name it as AppKit control stabilization, not visual theme locking.
- `apps/desktop/Sources/PromptPanel/PromptPanelGrowingTextView.swift`: apply disabled text / placeholder muted state from `AppTheme`.
- `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift`: add reusable Warm Command Sheet modifiers for icon hit area, attachment chips, trigger pills, banners, and action rows.
- `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`: update placeholder, attachment chip states, settings button hit area, banner semantics, action row description / trigger pill, and localized empty states.
- `apps/desktop/Sources/PromptPanel/prompt-panel.md`: replace fixed warm cream / fixed Aqua assumptions with current tokenized light/dark behavior and Warm Command Sheet constraints.
- `apps/desktop/Sources/Settings/settings.md`: document Settings resolved theme injection and self-refresh behavior.
- `apps/desktop/Sources/Theme/theme.md`: update only if implementation changes token mapping or adds token fields.
- `docs/manual-qa.md`: add PromptPanel light/dark and Settings theme sync QA items.

Test:

- `apps/desktop/TestsSwift/PromptPanel/PromptPanelAppearanceTests.swift`: replace old fixed Aqua visual assertion with tests for theme injection and AppKit appearance boundary.
- `apps/desktop/TestsSwift/AppServices/ProductionSettingsWindowPresenterTests.swift`: cover Settings root view theme refresh through the presenter.
- `apps/desktop/TestsSwift/Coordinator/SettingsLifecycleTests.swift`: cover refresh of an already-open Settings window.
- `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`: update `StubSettingsWindowPresenter` conformance and add one coordinator-level theme refresh assertion if the existing stubs expose enough state.
- `apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift`: keep existing submit / action / attachment behavior green; add only behavior tests needed for empty-state helpers if new plain Swift helpers are introduced.

Do not modify:

- `design/tokens.json`, unless an existing semantic color is demonstrably insufficient. The expected implementation can use existing `warning`, `error`, `accentRing`, `surfaceSoft`, `surfaceHover`, `surface`, `hairline`, `textPrimary`, `textSecondary`, and `mutedSoft` theme colors.
- Electron / React thread window code. This spec only verifies the existing `theme.changed` path remains invoked.
- Prompt submission DTOs, Action manifest schema, plugin binding, capture providers, or implicit context behavior.

---

### Task 1: Worktree, Context, And Baseline

**Files:**
- Read: `AGENTS.md`
- Read: `handAgent.md`
- Read: `apps/apps.md`
- Read: `apps/desktop/desktop.md`
- Read: `apps/desktop/Sources/sources.md`
- Read: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Read: `apps/desktop/Sources/Settings/settings.md`
- Read: `apps/desktop/Sources/Theme/theme.md`
- Read: `apps/desktop/Sources/AppServices/app-services.md`
- Read: `apps/desktop/Sources/Coordinator/coordinator.md` if present; otherwise read `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift` directly.
- No code changes.

- [ ] **Step 1: Create the implementation worktree**

Run from `/Users/mu9/proj/handAgent`:

```bash
git worktree add .worktrees/promptpanel-warm-command-sheet -b codex/promptpanel-warm-command-sheet
```

Expected: command succeeds and creates `/Users/mu9/proj/handAgent/.worktrees/promptpanel-warm-command-sheet`.

- [ ] **Step 2: Enter the worktree**

```bash
cd /Users/mu9/proj/handAgent/.worktrees/promptpanel-warm-command-sheet
```

Expected: `pwd` prints `/Users/mu9/proj/handAgent/.worktrees/promptpanel-warm-command-sheet`.

- [ ] **Step 3: Install dependencies**

```bash
pnpm install
```

Expected: install completes without changing the implementation goal. If lockfile changes, inspect it before continuing and only keep it if the package manager legitimately updated metadata.

- [ ] **Step 4: Read required architecture docs**

```bash
sed -n '1,220p' handAgent.md
sed -n '1,220p' apps/apps.md
sed -n '1,220p' apps/desktop/desktop.md
sed -n '1,220p' apps/desktop/Sources/sources.md
sed -n '1,220p' apps/desktop/Sources/PromptPanel/prompt-panel.md
sed -n '1,220p' apps/desktop/Sources/Settings/settings.md
sed -n '1,220p' apps/desktop/Sources/Theme/theme.md
sed -n '1,220p' apps/desktop/Sources/AppServices/app-services.md
```

Expected: docs confirm PromptPanel is Swift native, Electron is the only Thread UI shell, theme tokens come from `design/tokens.json`, and PromptPanel does not collect implicit context.

- [ ] **Step 5: Run the baseline Swift build**

```bash
bash ./scripts/swiftw build
```

Expected: PASS before edits. If it fails, record the failure and fix only environment/setup issues before feature work.

- [ ] **Step 6: Run the baseline Swift tests**

```bash
bash ./scripts/swiftw test
```

Expected: PASS before edits. If it fails, record the failing test names before any implementation change.

- [ ] **Step 7: Run the baseline TypeScript tests**

```bash
bash ./scripts/test.sh
```

Expected: PASS before edits. This task should not change TS code, but the repo requires this baseline.

- [ ] **Step 8: Commit no changes**

Run:

```bash
git status --short
```

Expected: no implementation changes yet. Do not commit this task unless dependency installation made intentional tracked changes.

---

### Task 2: Settings Theme Refresh Contract

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- Modify: `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ProductionSettingsWindowPresenterTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/SettingsLifecycleTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`

- [ ] **Step 1: Write the failing Settings presenter refresh test**

Append this test to `apps/desktop/TestsSwift/AppServices/ProductionSettingsWindowPresenterTests.swift`:

```swift
    func testUpdateThemeRefreshesPresentedSettingsRootView() {
        let presenter = ProductionSettingsWindowPresenter()

        let window = presenter.present(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .light,
            onClose: {}
        )
        defer { window?.close() }

        presenter.updateTheme(.dark, for: window)

        let hosting = window?.contentViewController as? NSHostingController<AnyView>
        XCTAssertNotNil(hosting)
    }
```

This test intentionally checks the new public refresh method exists and can refresh the root view without replacing the window.

- [ ] **Step 2: Run the targeted failing test**

```bash
bash ./scripts/swiftw test --filter ProductionSettingsWindowPresenterTests/testUpdateThemeRefreshesPresentedSettingsRootView
```

Expected: FAIL because `ProductionSettingsWindowPresenter.updateTheme(_:for:)` and the `AnyView` hosting controller shape are not implemented yet.

- [ ] **Step 3: Write the failing SettingsLifecycle refresh test**

Append this helper and test to `apps/desktop/TestsSwift/Coordinator/SettingsLifecycleTests.swift`:

```swift
@MainActor
private final class ThemeRefreshingSettingsWindowPresenter: SettingsWindowPresenting {
    private(set) var refreshedThemes: [AppTheme] = []
    private let window = NSWindow()

    func present(
        settingsViewModel: AgentSettingsViewModel,
        appearanceViewModel: AppearanceSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        appTheme: AppTheme,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        window
    }

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        refreshedThemes.append(appTheme)
    }
}
```

Then add:

```swift
    @MainActor
    func testUpdateThemeRefreshesOpenWindow() {
        let presenter = ThemeRefreshingSettingsWindowPresenter()
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .light,
            onClosed: {}
        )

        lifecycle.updateTheme(.dark)

        XCTAssertEqual(presenter.refreshedThemes.count, 1)
    }
```

- [ ] **Step 4: Run the targeted failing lifecycle test**

```bash
bash ./scripts/swiftw test --filter SettingsLifecycleTests/testUpdateThemeRefreshesOpenWindow
```

Expected: FAIL because `SettingsWindowPresenting.updateTheme` and `SettingsLifecycle.updateTheme` do not exist.

- [ ] **Step 5: Extend the Settings presenter protocol**

In `apps/desktop/Sources/AppServices/AppServices.swift`, change `SettingsWindowPresenting` to include:

```swift
@MainActor
protocol SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        appearanceViewModel: AppearanceSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        appTheme: AppTheme,
        onClose: @escaping () -> Void
    ) -> NSWindow?

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?)
}
```

Update `NopSettingsWindowPresenter` in the same file:

```swift
    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {}
```

Update `StubSettingsWindowPresenter` in `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`:

```swift
    private(set) var refreshedThemes: [AppTheme] = []

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        refreshedThemes.append(appTheme)
    }
```

- [ ] **Step 6: Implement production Settings root view refresh**

In `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`, add stored presentation state:

```swift
    private var presentations: [ObjectIdentifier: SettingsPresentation] = [:]
```

Add the private state type near `SendableClosure`:

```swift
private struct SettingsPresentation {
    let settingsViewModel: AgentSettingsViewModel
    let appearanceViewModel: AppearanceSettingsViewModel
    let toolSettingsViewModel: ToolSettingsViewModel
    let pluginSettingsViewModel: PluginSettingsViewModel
    let appendPromptSettingsViewModel: AppendPromptSettingsViewModel
    let mcpSettingsViewModel: MCPSettingsViewModel
    let permissionRulesViewModel: PermissionRulesViewModel
    let workspaceViewModel: WorkspaceSettingsViewModel
    let shortcutActions: [ActionDefinition]
}
```

Add a helper on `ProductionSettingsWindowPresenter`:

```swift
    private func makeRootView(
        presentation: SettingsPresentation,
        appTheme: AppTheme
    ) -> AnyView {
        AnyView(
            SettingsView(
                settingsViewModel: presentation.settingsViewModel,
                appearanceViewModel: presentation.appearanceViewModel,
                toolSettingsViewModel: presentation.toolSettingsViewModel,
                pluginSettingsViewModel: presentation.pluginSettingsViewModel,
                appendPromptSettingsViewModel: presentation.appendPromptSettingsViewModel,
                mcpSettingsViewModel: presentation.mcpSettingsViewModel,
                permissionRulesViewModel: presentation.permissionRulesViewModel,
                workspaceViewModel: presentation.workspaceViewModel,
                shortcutActions: presentation.shortcutActions
            )
            .environment(\.appTheme, appTheme)
        )
    }
```

In `present(...)`, build a `SettingsPresentation` first and create the hosting controller as:

```swift
        let presentation = SettingsPresentation(
            settingsViewModel: settingsViewModel,
            appearanceViewModel: appearanceViewModel,
            toolSettingsViewModel: toolSettingsViewModel,
            pluginSettingsViewModel: pluginSettingsViewModel,
            appendPromptSettingsViewModel: appendPromptSettingsViewModel,
            mcpSettingsViewModel: mcpSettingsViewModel,
            permissionRulesViewModel: permissionRulesViewModel,
            workspaceViewModel: workspaceViewModel,
            shortcutActions: shortcutActions
        )
        let hosting = NSHostingController(rootView: makeRootView(
            presentation: presentation,
            appTheme: appTheme
        ))
```

After `let windowID = ObjectIdentifier(window)`, store the presentation:

```swift
        presentations[windowID] = presentation
```

Inside the existing close observation closure, also clear it:

```swift
            self?.presentations[windowID] = nil
```

Add the protocol method:

```swift
    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        guard
            let window,
            let presentation = presentations[ObjectIdentifier(window)],
            let hosting = window.contentViewController as? NSHostingController<AnyView>
        else { return }

        hosting.rootView = makeRootView(presentation: presentation, appTheme: appTheme)
    }
```

- [ ] **Step 7: Add lifecycle refresh**

In `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`, add:

```swift
    func updateTheme(_ appTheme: AppTheme) {
        guard let window else { return }
        windowPresenter.updateTheme(appTheme, for: window)
    }
```

- [ ] **Step 8: Route theme changes from coordinator to Settings**

In `apps/desktop/Sources/Coordinator/AppCoordinator.swift`, update `setupAppearanceTheme()`:

```swift
        services.appearanceThemeService.onThemeChange = { [weak self] theme in
            guard let self else { return }
            let appTheme = self.services.appearanceThemeService.appTheme
            self.promptPanelController.updateTheme(appTheme)
            self.settingsLifecycle.updateTheme(appTheme)
            try? self.services.threadWindowCommandClient.sendThemeChanged(theme)
        }
```

- [ ] **Step 9: Update the old Settings Aqua test name and assertion**

Replace `testPresentedWindowUsesAquaAppearance` in `ProductionSettingsWindowPresenterTests.swift` with:

```swift
    func testPresentedWindowKeepsAquaForAppKitControlStabilization() {
        let presenter = ProductionSettingsWindowPresenter()

        let window = presenter.present(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .dark,
            onClose: {}
        )
        defer { window?.close() }

        XCTAssertEqual(
            window?.appearance?.bestMatch(from: [.aqua, .darkAqua]),
            .aqua
        )
        XCTAssertTrue(window?.contentViewController is NSHostingController<AnyView>)
    }
```

This preserves the current AppKit stabilization behavior while no longer treating `.aqua` as proof of a fixed light visual theme.

- [ ] **Step 10: Run targeted Settings tests**

```bash
bash ./scripts/swiftw test --filter ProductionSettingsWindowPresenterTests
bash ./scripts/swiftw test --filter SettingsLifecycleTests
```

Expected: PASS.

- [ ] **Step 11: Commit Settings theme refresh**

```bash
git add apps/desktop/Sources/AppServices/AppServices.swift \
  apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift \
  apps/desktop/Sources/Coordinator/SettingsLifecycle.swift \
  apps/desktop/Sources/Coordinator/AppCoordinator.swift \
  apps/desktop/TestsSwift/AppServices/ProductionSettingsWindowPresenterTests.swift \
  apps/desktop/TestsSwift/Coordinator/SettingsLifecycleTests.swift \
  apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift
git commit -m "fix: refresh settings window theme"
```

Expected: commit succeeds.

---

### Task 3: PromptPanel Theme Boundary Tests

**Files:**
- Modify: `apps/desktop/TestsSwift/PromptPanel/PromptPanelAppearanceTests.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`

- [ ] **Step 1: Replace the old fixed-Aqua test with theme injection tests**

Replace the contents of `apps/desktop/TestsSwift/PromptPanel/PromptPanelAppearanceTests.swift` with:

```swift
import AppKit
import SwiftUI
import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelAppearanceTests: XCTestCase {
    func testShowKeepsAquaForAppKitControlStabilization() {
        let controller = PromptPanelController(focusRestorer: FakePromptPanelAppearanceFocusRestorer())
        controller.configure(viewModel: PromptPanelViewModel(actions: []))
        defer { controller.hide() }

        controller.show()

        let panel = Mirror(reflecting: controller).descendant("panel") as? NSPanel
        XCTAssertEqual(
            panel?.appearance?.bestMatch(from: [.aqua, .darkAqua]),
            .aqua
        )
    }

    func testUpdateThemeRefreshesExistingRootViewWithoutReplacingViewModel() {
        let controller = PromptPanelController(focusRestorer: FakePromptPanelAppearanceFocusRestorer())
        let viewModel = PromptPanelViewModel(actions: [])
        viewModel.draft = "keep me"
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        controller.show()
        controller.updateTheme(.dark)

        let panel = Mirror(reflecting: controller).descendant("panel") as? NSPanel
        let hosting = panel?.contentView as? NSHostingView<AnyView>
        XCTAssertNotNil(hosting)
        XCTAssertEqual(viewModel.draft, "keep me")
    }
}

@MainActor
private final class FakePromptPanelAppearanceFocusRestorer: PromptPanelFocusRestoring {
    typealias Token = Int

    func captureCurrentFocusOwner() -> Int? { nil }
    func restoreFocus(to token: Int) {}
}
```

- [ ] **Step 2: Run the targeted PromptPanel appearance tests**

```bash
bash ./scripts/swiftw test --filter PromptPanelAppearanceTests
```

Expected: PASS if existing `PromptPanelController.updateTheme(_:)` already refreshes an existing `NSHostingView<AnyView>` and keeps the ViewModel.

- [ ] **Step 3: If the test fails because the hosting view type differs, make `PromptPanelController` explicit**

In `PromptPanelController.ensurePanel()`, keep the hosting view creation as:

```swift
        let hostingView = NSHostingView(
            rootView: AnyView(PromptPanelView(viewModel: viewModel).environment(\.appTheme, appTheme))
        )
```

In `PromptPanelController.updateTheme(_:)`, keep the refresh as:

```swift
    func updateTheme(_ theme: AppTheme) {
        appTheme = theme
        guard let viewModel, let hostingView = panel?.contentView as? NSHostingView<AnyView> else {
            return
        }
        hostingView.rootView = AnyView(PromptPanelView(viewModel: viewModel).environment(\.appTheme, theme))
    }
```

- [ ] **Step 4: Run the targeted PromptPanel appearance tests again**

```bash
bash ./scripts/swiftw test --filter PromptPanelAppearanceTests
```

Expected: PASS.

- [ ] **Step 5: Commit PromptPanel theme boundary tests**

```bash
git add apps/desktop/TestsSwift/PromptPanel/PromptPanelAppearanceTests.swift \
  apps/desktop/Sources/PromptPanel/PromptPanelController.swift
git commit -m "test: clarify prompt panel theme boundary"
```

Expected: commit succeeds. If `PromptPanelController.swift` did not change, omit it from `git add`.

---

### Task 4: Warm Command Sheet Visual Implementation

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelGrowingTextView.swift`
- Modify: `apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift` only if a plain Swift helper is introduced.

- [ ] **Step 1: Add reusable PromptPanel style primitives**

Replace `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift` with:

```swift
import SwiftUI

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(theme.colors.canvas.opacity(0.97))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.lg)
                    .strokeBorder(theme.colors.hairline, lineWidth: 0.8)
            )
            .shadow(color: theme.colors.ink.opacity(0.14), radius: 26, x: 0, y: 18)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isHighlighted: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.vertical, 9)
            .padding(.horizontal, theme.spacing.md)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHighlighted ? theme.colors.surfaceHover : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : Color.clear, lineWidth: 0.8)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelIconButtonModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHovered: Bool

    func body(content: Content) -> some View {
        content
            .frame(width: 32, height: 32)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHovered ? theme.colors.surfaceHover : Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelTriggerPillModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHighlighted: Bool

    func body(content: Content) -> some View {
        content
            .font(theme.typography.captionFont)
            .foregroundStyle(isHighlighted ? theme.colors.accent : theme.colors.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(isHighlighted ? theme.colors.surfaceHover : theme.colors.surfaceSoft)
            )
            .overlay(
                Capsule()
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : theme.colors.hairlineSoft, lineWidth: 0.6)
            )
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow(isHighlighted: Bool = false) -> some View {
        modifier(ActionRowModifier(isHighlighted: isHighlighted))
    }

    func promptPanelIconButton(isHovered: Bool) -> some View {
        modifier(PromptPanelIconButtonModifier(isHovered: isHovered))
    }

    func promptPanelTriggerPill(isHighlighted: Bool) -> some View {
        modifier(PromptPanelTriggerPillModifier(isHighlighted: isHighlighted))
    }
}
```

- [ ] **Step 2: Make disabled input visually muted**

In `apps/desktop/Sources/PromptPanel/PromptPanelGrowingTextView.swift`, update both `makeNSView` and `updateNSView`.

Use this text color expression:

```swift
        textView.textColor = NSColor(isDisabled ? theme.colors.textSecondary : theme.colors.textPrimary)
```

Use this placeholder color expression:

```swift
        textView.placeholderColor = NSColor(isDisabled ? theme.colors.mutedSoft : theme.colors.textSecondary)
```

Keep `textView.isEditable = !isDisabled` and `textView.isSelectable = !isDisabled`.

- [ ] **Step 3: Add settings button hover state to PromptPanelView**

In `PromptPanelView`, add:

```swift
    @State private var isSettingsHovered = false
```

Replace `settingsButton` with:

```swift
    private var settingsButton: some View {
        Button { viewModel.openSettings() } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(isSettingsHovered ? theme.colors.textPrimary : theme.colors.textSecondary)
                .font(.system(size: 14, weight: .medium))
                .promptPanelIconButton(isHovered: isSettingsHovered)
        }
        .buttonStyle(.plain)
        .help("打开设置 (⌘,)")
        .accessibilityLabel("打开设置")
        .onHover { hovering in
            withAnimation(.easeInOut(duration: theme.animation.highlightDuration)) {
                isSettingsHovered = hovering
            }
        }
    }
```

- [ ] **Step 4: Update the input placeholder**

In `inputField`, change:

```swift
            placeholder: "输入请求，Return 提交",
```

Expected: empty prompt remains narrow because `PromptPanelInputLayout` is unchanged.

- [ ] **Step 5: Replace attachment chip rendering**

In `PromptPanelView`, replace `attachmentChip(_:)` with:

```swift
    private func attachmentChip(_ attachment: PromptAttachmentResult) -> some View {
        let style = attachmentStyle(for: attachment)
        return HStack(spacing: 6) {
            chipLabel(for: attachment, foreground: style.foreground)
            Button {
                viewModel.removeAttachment(id: attachment.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(style.foreground)
                    .frame(width: 18, height: 18)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .help("移除附件")
            .accessibilityLabel("移除附件")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .padding(.vertical, 5)
        .borderedCard(fill: style.background, border: style.border, cornerRadius: theme.radius.sm, borderWidth: 0.8)
        .help(tooltip(for: attachment))
    }
```

Add this helper inside `PromptPanelView`:

```swift
    private func attachmentStyle(for attachment: PromptAttachmentResult) -> (
        foreground: Color,
        background: Color,
        border: Color
    ) {
        if attachment.isError {
            return (theme.colors.error, theme.colors.surfaceSoft, theme.colors.error.opacity(0.55))
        }
        if attachment.isImage {
            return (theme.colors.textPrimary, theme.colors.surfaceSoft, theme.colors.accentRing)
        }
        return (theme.colors.textPrimary, theme.colors.surfaceSoft, theme.colors.hairline)
    }
```

Keep `chipLabel` image preview behavior, but update the image icon affordance:

```swift
            Image(systemName: attachment.iconSystemName)
                .font(.system(size: 11, weight: attachment.isImage ? .semibold : .regular))
                .foregroundStyle(attachment.isImage ? theme.colors.accent : foreground)
```

- [ ] **Step 6: Replace server/action banner semantics**

Replace `submissionDisabledBanner(_:)` with:

```swift
    private func submissionDisabledBanner(_ message: String) -> some View {
        let isActionError = message.hasPrefix("缺少必填参数") || message.contains("Action 渲染失败")
        let semanticColor = isActionError ? theme.colors.error : theme.colors.warning
        let iconName = isActionError ? "exclamationmark.triangle" : "wifi.exclamationmark"
        let displayMessage = isActionError ? message : "\(message)，草稿已保留"

        return HStack(spacing: theme.spacing.sm) {
            Image(systemName: iconName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(semanticColor)
            Text(displayMessage)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
                .lineLimit(2)
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .fill(theme.colors.surfaceSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(semanticColor.opacity(0.5), lineWidth: 0.8)
        )
    }
```

- [ ] **Step 7: Localize empty states**

Replace the empty state inside `actionList`:

```swift
                if viewModel.filteredActions.isEmpty {
                    Text(emptyActionsMessage)
                        .foregroundStyle(theme.colors.muted)
                        .font(theme.typography.bodyFont)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, theme.spacing.md)
                } else {
                    ForEach(viewModel.filteredActions) { action in
                        actionRow(action)
                    }
                }
```

Add:

```swift
    private var emptyActionsMessage: String {
        viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "暂无可用 Action"
            : "没有匹配的 Action"
    }
```

- [ ] **Step 8: Add action descriptions and trigger pill**

Replace `actionRow(_:)` with:

```swift
    private func actionRow(_ action: ActionDefinition) -> some View {
        let isHovered = hoveredActionId == action.id
        return Button { viewModel.selectAction(action) } label: {
            HStack(alignment: .center, spacing: theme.spacing.md) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(action.title)
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(isHovered ? theme.colors.textPrimary : theme.colors.bodyStrong)
                        .lineLimit(1)
                    if let description = action.description, !description.isEmpty {
                        Text(description)
                            .font(theme.typography.captionFont)
                            .foregroundStyle(theme.colors.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: theme.spacing.md)
                Text(action.trigger)
                    .promptPanelTriggerPill(isHighlighted: isHovered)
            }
            .actionRow(isHighlighted: isHovered)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: theme.animation.highlightDuration)) {
                hoveredActionId = hovering ? action.id : nil
            }
        }
    }
```

- [ ] **Step 9: Run targeted PromptPanel tests**

```bash
bash ./scripts/swiftw test --filter PromptPanelInputLayoutTests
bash ./scripts/swiftw test --filter PromptPanelViewModelTests
bash ./scripts/swiftw test --filter PromptPanelControllerTests
bash ./scripts/swiftw test --filter PromptPanelAppearanceTests
```

Expected: PASS. These tests protect the non-visual behavior: empty draft width, submit, action submit, attachment filtering, QuickLook handoff, focus restoration, and theme injection.

- [ ] **Step 10: Build Swift after visual changes**

```bash
bash ./scripts/swiftw build
```

Expected: PASS. SwiftUI type inference errors are most likely in tuple helper return values or `NSHostingController<AnyView>` casts; fix those before continuing.

- [ ] **Step 11: Commit Warm Command Sheet visuals**

```bash
git add apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift \
  apps/desktop/Sources/PromptPanel/PromptPanelView.swift \
  apps/desktop/Sources/PromptPanel/PromptPanelGrowingTextView.swift \
  apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift
git commit -m "feat: style prompt panel warm command sheet"
```

Expected: commit succeeds. If `PromptPanelViewModelTests.swift` did not change, omit it from `git add`.

---

### Task 5: Regression Verification For Behavior Boundaries

**Files:**
- Modify tests only if a real regression is discovered.

- [ ] **Step 1: Run all PromptPanel tests**

```bash
bash ./scripts/swiftw test --filter PromptPanel
```

Expected: PASS.

- [ ] **Step 2: Run Settings and Appearance tests**

```bash
bash ./scripts/swiftw test --filter Settings
bash ./scripts/swiftw test --filter Appearance
bash ./scripts/swiftw test --filter AppTheme
```

Expected: PASS.

- [ ] **Step 3: Run AppCoordinator tests**

```bash
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

Expected: PASS. This confirms theme changes still send `theme.changed`, settings open/focus behavior still works, and prompt submission flow is not broken.

- [ ] **Step 4: Fix only proven regressions**

If a regression appears, first identify the failing assertion and trace the touched call path. Do not rewrite PromptPanel architecture. Expected valid fixes are limited to:

```swift
// Settings refresh state plumbing
settingsLifecycle.updateTheme(appTheme)

// PromptPanel theme root replacement
hostingView.rootView = AnyView(PromptPanelView(viewModel: viewModel).environment(\.appTheme, theme))

// Button hit testing
.contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
```

- [ ] **Step 5: Commit regression fixes if needed**

```bash
git status --short
git add <only-files-changed-for-regression-fix>
git commit -m "fix: preserve prompt panel behavior"
```

Expected: commit only if Step 4 produced actual code/test changes.

---

### Task 6: Documentation And Manual QA Updates

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/Sources/Settings/settings.md`
- Modify: `apps/desktop/Sources/Theme/theme.md` only if token fields or theme mapping changed.
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Update PromptPanel docs**

In `apps/desktop/Sources/PromptPanel/prompt-panel.md`, ensure the document states:

```markdown
- PromptPanel 的视觉主题由 `AppearanceThemeService.appTheme` 注入的 `AppTheme.light/dark` 决定；`design/tokens.json` 是 token 源，`GeneratedThemeTokens.swift` 是生成产物。
- `PromptPanelController` 可以保留 `NSAppearance(.aqua)` 作为 AppKit 控件渲染稳定手段，但这不是固定浅色 UI；SwiftUI 视觉必须来自 `AppTheme`。
- Warm Command Sheet 约束：容器、输入、附件 chip、server banner、action row、trigger pill、empty state 都使用 `theme.colors.*`、`theme.spacing.*`、`theme.radius.*`。
- PromptPanel 只提交用户主动输入和用户主动附件，不读取屏幕、剪贴板、App 状态或文件上下文。
- 空 draft 时输入控件只覆盖 placeholder 附近，有内容后占满设置按钮左侧剩余宽度，最多 5 行后滚动。
```

Remove any line that says PromptPanel is fixed warm cream, fixed Aqua visual, single theme, or dark mode is outside Swift native UI.

- [ ] **Step 2: Update Settings docs**

In `apps/desktop/Sources/Settings/settings.md`, ensure the document states:

```markdown
- Settings 的外观 Tab 写入 `AppearanceThemeService`，该服务解析 `light/dark/system` 后更新 Swift 原生 UI，并通过 `theme.changed` 同步 Electron/React。
- 已打开的 Settings 窗口必须通过 `SettingsLifecycle.updateTheme(_:)` 和 `SettingsWindowPresenting.updateTheme(_:for:)` 重新注入 `AppTheme`，避免用户切换主题后 Settings 自身停留在旧 token。
- Settings 窗口可以保留 `NSAppearance(.aqua)` 作为 AppKit 控件渲染稳定手段，但视觉正确性以注入的 `AppTheme.light/dark` 为准。
```

Remove any line that says Settings is fixed Aqua as the visual theme, or React ThreadWindow theme is independent from Settings preference.

- [ ] **Step 3: Decide whether Theme docs need changes**

Run:

```bash
git diff -- design/tokens.json apps/desktop/Sources/Theme/AppTheme.swift apps/desktop/Sources/Theme/GeneratedThemeTokens.swift
```

Expected for this plan: no diff. If there is no diff, add this note nowhere; `theme.md` does not need a change. If there is a diff, update `apps/desktop/Sources/Theme/theme.md` with the exact new token field or mapping and explain which semantic states consume it.

- [ ] **Step 4: Update manual QA**

In `docs/manual-qa.md`, add a section or checklist entries with this content:

```markdown
### PromptPanel Warm Command Sheet / theme sync

- [ ] 浅色主题打开 PromptPanel：容器、输入 placeholder、附件 chip、action row、trigger pill、server banner 使用 warm canvas/coral 语义，文字对比清晰。
- [ ] 深色主题打开 PromptPanel：无固定浅色残留，hover/focus、warning/error、selection error chip、图片附件预览 affordance 均可辨认。
- [ ] 空 draft 时 PromptPanel 仍可拖动；输入内容后编辑区占满设置按钮左侧剩余宽度；超过 5 行后滚动。
- [ ] 已打开 Settings 时切换外观：Settings 自身立即刷新，PromptPanel 下次或当前显示时使用同一 resolved theme，Electron ThreadWindow 收到同步主题。
- [ ] agent-server 不可用或 Action 缺必填参数时，banner 使用 warning/error 语义，草稿不丢失。
- [ ] 图片附件 chip 可预览，删除按钮点击区域与视觉边界一致。
```

- [ ] **Step 5: Commit documentation updates**

```bash
git add apps/desktop/Sources/PromptPanel/prompt-panel.md \
  apps/desktop/Sources/Settings/settings.md \
  apps/desktop/Sources/Theme/theme.md \
  docs/manual-qa.md
git commit -m "docs: update prompt panel theme guidance"
```

Expected: commit succeeds. If `theme.md` did not change, omit it from `git add`.

---

### Task 7: Required Independent Documentation Audit

**Files:**
- Read: `docs/superpowers/specs/2026-06-10-promptpanel-warm-command-sheet-design.md`
- Read: every modified file from Tasks 2-6.
- Modify docs only if the audit finds drift.

- [ ] **Step 1: Dispatch an independent documentation audit subagent**

Use a fresh subagent with this exact task:

```text
你只做文档审核与必要文档更新，不改生产代码。

请阅读：
- docs/superpowers/specs/2026-06-10-promptpanel-warm-command-sheet-design.md
- handAgent.md
- apps/apps.md
- apps/desktop/desktop.md
- apps/desktop/Sources/sources.md
- apps/desktop/Sources/PromptPanel/prompt-panel.md
- apps/desktop/Sources/Settings/settings.md
- apps/desktop/Sources/Theme/theme.md
- apps/desktop/Sources/AppServices/app-services.md
- apps/desktop/Sources/Coordinator/SettingsLifecycle.swift
- apps/desktop/Sources/AppServices/AppServices.swift
- apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift
- apps/desktop/Sources/PromptPanel/PromptPanelController.swift
- apps/desktop/Sources/PromptPanel/PromptPanelView.swift
- apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift
- docs/manual-qa.md

核对 spec、代码、相关 md 是否一致。若发现过期文档，只更新文档；不要修改 Swift 代码。最终回复列出：
1. 已检查的文档；
2. 修改过的文档路径；
3. 是否确认 docs/manual-qa.md 覆盖了本 spec 的手工 QA。
```

- [ ] **Step 2: Review the subagent result**

Expected: subagent either reports no further doc changes needed, or returns documentation edits only.

- [ ] **Step 3: If the subagent changed docs, inspect and commit**

```bash
git diff -- apps/desktop/Sources/PromptPanel/prompt-panel.md \
  apps/desktop/Sources/Settings/settings.md \
  apps/desktop/Sources/Theme/theme.md \
  apps/desktop/Sources/AppServices/app-services.md \
  docs/manual-qa.md
git add apps/desktop/Sources/PromptPanel/prompt-panel.md \
  apps/desktop/Sources/Settings/settings.md \
  apps/desktop/Sources/Theme/theme.md \
  apps/desktop/Sources/AppServices/app-services.md \
  docs/manual-qa.md
git commit -m "docs: align prompt panel warm command sheet audit"
```

Expected: commit only if the subagent made doc changes.

---

### Task 8: Final Verification And Delivery Commit State

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full Swift tests**

```bash
bash ./scripts/swiftw test
```

Expected: PASS.

- [ ] **Step 2: Run Swift build**

```bash
bash ./scripts/swiftw build
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript tests**

```bash
bash ./scripts/test.sh
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

```bash
git status --short
git log --oneline --max-count=6
```

Expected: no uncommitted changes. Recent commits should include Settings refresh, PromptPanel visual implementation, docs update, and optional audit docs commit.

- [ ] **Step 5: If final verification required fixes, commit them**

```bash
git add <files-fixed-after-final-verification>
git commit -m "fix: complete prompt panel warm command sheet"
```

Expected: commit only if Step 1-3 exposed issues and fixes were made.

---

## Self-Review

Spec coverage:

- Warm Command Sheet visuals: Task 4 covers container, input placeholder/disabled, settings hit area, attachment chip semantics, warning/error banner, action description/trigger pill, and localized empty states.
- Theme regression risk: Tasks 2 and 3 cover Settings refresh, PromptPanel root view theme injection, and `.aqua` as AppKit stabilization rather than fixed light visual.
- Behavior boundaries: Task 5 reruns PromptPanel, Settings, Appearance, AppTheme, and AppCoordinator tests without changing submission DTOs or capture behavior.
- Outdated docs: Tasks 6 and 7 update PromptPanel, Settings, Theme-if-needed, manual QA, and require independent doc audit before completion.

Placeholder scan:

- No task uses placeholder markers or unconstrained “add appropriate handling” language.
- Code steps include concrete Swift snippets, exact file paths, commands, and expected outcomes.

Type consistency:

- `SettingsWindowPresenting.updateTheme(_:for:)` is used consistently by `ProductionSettingsWindowPresenter`, `NopSettingsWindowPresenter`, `StubSettingsWindowPresenter`, `SettingsLifecycle`, and test-only presenters.
- `NSHostingController<AnyView>` is used consistently for Settings refresh.
- `NSHostingView<AnyView>` is used consistently for PromptPanel refresh.
