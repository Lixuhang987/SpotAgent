# Lifecycle 模块

应用激活策略协调。

## 文件

| 文件 | 职责 |
|------|------|
| `AppActivationPolicyCoordinator.swift` | 根据打开的 SessionWindow / SettingsWindow 数量切换 `NSApp.activationPolicy` |

## 行为

- 有 SessionWindow 或 SettingsWindow 打开 → `.regular`（出现在 Dock 与 Cmd+Tab）。
- 都关闭 → `.accessory`（纯后台 app，仅 StatusBubble 可见）。

## 设计备注

- 通过 delta（`+1` / `-1`）增减计数，外部不需要维护绝对值。
- `max(0, ...)` 防御性处理，防止计数变负。
- Settings 窗口走独立 `policyAfterUpdatingSettingsWindow(isOpen:)`，与 Session 计数解耦。

## 编辑此目录的约束

- 计数与策略派生是纯逻辑，不调 `NSApp`；切换由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 中的 `setActivationPolicy` 闭包完成（测试可注入 mock）。
- 不要在此处依赖 SwiftUI / AppKit。
- 测试：[AppActivationPolicyCoordinatorTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppActivationPolicyCoordinatorTests.swift)。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有；在 `bootstrap()` / `handleSubmitPrompt` / `handleSessionClosed` / `openOrFocusSettingsWindow` / `handleSettingsWindowClosed` 中调用。
