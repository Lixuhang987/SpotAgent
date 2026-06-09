# Lifecycle 模块

应用激活策略协调。

## 文件

| 文件 | 职责 |
|------|------|
| `AppActivationPolicyCoordinator.swift` | 根据打开的 ThreadWindow / SettingsWindow 数量切换 `NSApp.activationPolicy` |

## 行为

- 有 ThreadWindow 或 SettingsWindow 打开 → `.regular`（出现在 Dock 与 Cmd+Tab）。
- 都关闭 → `.accessory`（纯后台 app，Electron ActivityWindow 可继续显示）。

## 设计备注

- 通过 delta（`+1` / `-1`）增减计数，外部不需要维护绝对值。
- `max(0, ...)` 防御性处理，防止计数变负。
- Settings 窗口走独立 `policyAfterUpdatingSettingsWindow(isOpen:)`，与 ThreadWindow 计数解耦。

## 编辑此目录的约束

- 计数与策略派生是纯逻辑，不调 `NSApp`；切换由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 中的 `setActivationPolicy` 闭包完成（测试可注入 mock）。
- 不要在此处依赖 SwiftUI / AppKit。
- 测试：[AppActivationPolicyCoordinatorTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/Lifecycle/AppActivationPolicyCoordinatorTests.swift)。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 创建；thread 窗口开关通过 `AppCoordinator` 的 Electron command ack 回调更新，设置窗口开关通过 `SettingsLifecycle.openOrFocus / handleClosed` 更新。
