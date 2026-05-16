# PromptPanel 模块

全局热键唤起的命令面板：输入 prompt、展示并触发 PromptAction、跳转设置。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `PromptPanelView.swift` | 纯 UI：输入框 + action 列表，绑定 ViewModel 状态，消费 Theme token |
| `PromptPanelViewModel.swift` | `@Observable` 状态：`draft` / `focusSeed` / `filteredActions`；提交、隐藏、打开设置回调出口 |
| `PromptPanelController.swift` | `NSPanel` 生命周期、`NSEvent` 局部监听、ViewModel 注入 |
| `PromptPanelWindow.swift` | `NSPanel` 子类，处理失焦自动隐藏 |
| `PromptPanelStyles.swift` | `PromptPanelContainerModifier` / `ActionRowModifier` |
| `PromptAction.swift` | `PromptAction` 数据结构 + `filter(_:query:)` 静态方法 + `PromptAttachmentResult` 枚举 |

## 数据流

```
Coordinator
  └─ 注入 PromptAction 列表 → Controller.register(actions:)
                            └─ 创建 ViewModel(actions:)
                            └─ ViewModel.onSubmit/onHide/onOpenSettings 回调到 Controller
                                                                       └─ 转发给 Coordinator.send(.xxx)
Hotkey → Coordinator.send(.togglePromptPanel) → Controller.toggle()
                                              └─ 显示时 ViewModel.focusSeed += 1（驱动 View 重新聚焦输入框）
键盘事件 → NSEvent 局部监听 → ESC 隐藏 / shortcut 匹配 ViewModel.filteredActions → ViewModel.submitAction()
```

## 编辑此目录的约束

- **View 只读 ViewModel**：不要让 View 直接调 `NSEvent` / `NSPanel` / `KeyboardShortcuts.*` API，键盘与窗口副作用全部在 Controller。
- **ViewModel 不持有 SwiftUI 类型**：不要让 `@Observable` class 引入 `View` / `Color` / `Font`；只暴露 plain Swift 状态与回调。
- **Controller 是窗口管理 + 事件监听层**：不直接写消息循环或会话逻辑，所有跨模块意图通过 `onSubmit` / `onOpenSettings` 闭包出口给 Coordinator。
- **Action 默认快捷键**：在 `register(actions:)` 中**仅当用户未自定义时**写入默认值，不要每次启动覆盖用户配置。
- **Styles 抽取阈值**：跨 View 复用的样式才放 `PromptPanelStyles.swift`；一次性样式写在 View 里，避免 ViewModifier 爆炸。
- **PromptAction.filter 大小写不敏感**：title 与 keywords 两路匹配；新增匹配维度需保持纯函数 + 单元测试。
- **测试**：[PromptPanelViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanelViewModelTests.swift) 覆盖 draft 提交 / 过滤 / action 触发；[PromptActionTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptActionTests.swift) 覆盖过滤逻辑。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并注入 actions。
- 提交 prompt 后由 Coordinator 创建 [SessionWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) 与 `SessionViewModel`。
- "打开设置" action 由 Coordinator 路由到 [Settings](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 窗口。
- 全局热键来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md)。
