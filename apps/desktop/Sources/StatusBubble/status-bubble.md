# StatusBubble 模块

屏幕右下角的常驻状态气泡：显示当前 primary thread 是否在跑、最近摘要；点击后触发 Coordinator 的回跳逻辑。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `StatusBubbleView.swift` | 纯 UI：状态点 + 文本，运行时附 glow pulse 动画，绑定 ViewModel + Theme |
| `StatusBubbleViewModel.swift` | `@Observable` 派生层：从 `ThreadRegistry` 计算 `isRunning` / `latestSummary`；`onTap` 回调 |
| `StatusBubbleController.swift` | 持有 `NSPanel`（`.nonactivatingPanel`，floating，不进 Cmd+Tab），右下角定位，注入 ViewModel |
| `StatusBubbleStyles.swift` | `StatusBubbleContainerModifier`（运行态描边 + glow，闲置态低饱和） |

## 数据流

```
ThreadRegistry (@Observable) 变化
  └─ ViewModel.isRunning / latestSummary 自动重算（计算属性，无内部缓存）
  └─ View 自动刷新

用户点击气泡
  └─ ViewModel.tap() → onTap?(registry.primaryThreadID)
  └─ Coordinator.handleStatusBubbleTap(id) → 已有窗口则 makeKeyAndOrderFront；否则 promptPanelController.show()
```

## 编辑此目录的约束

- **ViewModel 只是 Registry 的派生视图**：不在内部维护 mirror 状态；新增展示字段先看能否从 `ThreadRegistry` 派生。
- **Controller 不知道 Registry**：注入路径是 `Controller.init(registry:) → ViewModel(registry:)`，Controller 不直接读 registry。
- **窗口位置策略写死右下角**：当前 `visibleFrame.maxX - width - 24, minY + 24`；新增多屏 / 拖拽支持需走 Controller，不要在 View 里写 `NSScreen` API。
- **`onTap` 出口只暴露 `threadID?`**：不要把 `ThreadSummary` 或更多 Registry 状态泄漏给 Coordinator；Coordinator 自己再去 Registry 查。
- **动画在 View 内闭环**：glow pulse 等装饰性动画用 SwiftUI `withAnimation` 完成，不要污染 ViewModel。
- **窗口与拖动区域**：`NSWindow` 设为 `isOpaque = false` + `backgroundColor = .clear` + `fullSizeContentView` + `titlebarAppearsTransparent`，避免气泡上方出现一条与 SwiftUI 圆角容器颜色不同的标题栏。`isMovableByWindowBackground = true` 让气泡所有空白区域都能拖；点击交互必须用 `onTapGesture` 挂在容器上而不是把整个内容包进 `Button`，否则 `Button` 会吞掉拖拽手势。
- **视觉风格**：气泡使用 `DESIGN.md` 的 cream canvas、warm hairline 和 coral/teal 运行状态。运行态 glow 只做轻量强调，不改变 `ThreadRegistry` 派生数据流。
- **首点击即生效**：Controller 用带 `.nonactivatingPanel` 样式的 `NSPanel`（且 `canBecomeKey = false`），点击不会被 AppKit 截走用于激活窗口/切换 key，直接派发为 `mouseDown` 触发 `onTapGesture`。不要换回普通 `NSWindow` 或试图通过包裹一层 `NSView` 重写 `acceptsFirstMouse` 来解决——AppKit 在 hit-test 后只会询问命中的叶子视图（即 `NSHostingView` 内部子树），外层包裹的覆写不会被采纳。
- **测试**：[StatusBubbleViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/StatusBubble/StatusBubbleViewModelTests.swift) 覆盖空 / 运行 / 已结束三种 registry 状态。

## 与其他模块的关系

- 数据源是 [Thread 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Thread/thread.md)。
- `onTap` 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `setupStatusBubble()` 注入，路由到 ThreadWindow / PromptPanel。
