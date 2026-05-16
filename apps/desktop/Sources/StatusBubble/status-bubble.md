# StatusBubble 模块

屏幕右下角的常驻状态气泡：显示当前 primary session 是否在跑、最近摘要；点击后触发 Coordinator 的回跳逻辑。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `StatusBubbleView.swift` | 纯 UI：状态点 + 文本，运行时附 glow pulse 动画，绑定 ViewModel + Theme |
| `StatusBubbleViewModel.swift` | `@Observable` 派生层：从 `SessionRegistry` 计算 `isRunning` / `latestSummary`；`onTap` 回调 |
| `StatusBubbleController.swift` | 持有 `NSWindow`（floating，不进 Cmd+Tab），右下角定位，注入 ViewModel |
| `StatusBubbleStyles.swift` | `StatusBubbleContainerModifier`（运行态描边 + glow，闲置态低饱和） |

## 数据流

```
SessionRegistry (@Observable) 变化
  └─ ViewModel.isRunning / latestSummary 自动重算（计算属性，无内部缓存）
  └─ View 自动刷新

用户点击气泡
  └─ ViewModel.tap() → onTap?(registry.primarySessionID)
  └─ Coordinator.handleStatusBubbleTap(id) → 已有窗口则 makeKeyAndOrderFront；否则 promptPanelController.show()
```

## 编辑此目录的约束

- **ViewModel 只是 Registry 的派生视图**：不在内部维护 mirror 状态；新增展示字段先看能否从 `SessionRegistry` 派生。
- **Controller 不知道 Registry**：注入路径是 `Controller.init(registry:) → ViewModel(registry:)`，Controller 不直接读 registry。
- **窗口位置策略写死右下角**：当前 `visibleFrame.maxX - width - 24, minY + 24`；新增多屏 / 拖拽支持需走 Controller，不要在 View 里写 `NSScreen` API。
- **`onTap` 出口只暴露 `sessionID?`**：不要把 `SessionSummary` 或更多 Registry 状态泄漏给 Coordinator；Coordinator 自己再去 Registry 查。
- **动画在 View 内闭环**：glow pulse 等装饰性动画用 SwiftUI `withAnimation` 完成，不要污染 ViewModel。
- **测试**：[StatusBubbleViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/StatusBubbleViewModelTests.swift) 覆盖空 / 运行 / 已结束三种 registry 状态。

## 与其他模块的关系

- 数据源是 [Session 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md)。
- `onTap` 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `setupStatusBubble()` 注入，路由到 SessionWindow / PromptPanel。
