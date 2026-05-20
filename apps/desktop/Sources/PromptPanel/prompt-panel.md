# PromptPanel 模块

全局热键唤起的命令面板：输入 prompt、展示并触发 PromptAction、跳转设置、打开会话历史。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `PromptPanelView.swift` | 纯 UI：输入框 + action 列表 + 附件 chip（图片 chip 可点击触发 QuickLook 预览）+ server 不可用提示，绑定 ViewModel 状态，消费 Theme token |
| `PromptPanelViewModel.swift` | `@Observable` 状态：`draft` / `focusSeed` / `filteredActions` / `attachments` / `submissionDisabledMessage`；支持 `updateActions(_:)` 刷新 action；`onSubmit` / `onHide` / `onOpenSettings` / `onPreviewImage` 回调出口 |
| `PromptPanelController.swift` | `NSPanel` 生命周期、ESC 局部监听、ViewModel 注入、持有 `QuickLookPreviewController` |
| `PromptPanelWindow.swift` | `NSPanel` 子类，处理失焦自动隐藏 |
| `PromptPanelStyles.swift` | `PromptPanelContainerModifier` / `ActionRowModifier` |
| `PromptAction.swift` | `PromptAction` 数据结构 + `filter(_:query:)` 静态方法 + `PromptAttachmentResult` 枚举（`textSelection` / `selectionError` / `textToken` / `imageRegion` / `noAttachment`） |
| `QuickLookPreviewController.swift` | 把 `imageRegion` 的 base64 写入 `NSTemporaryDirectory()`，通过 `QLPreviewPanel` 共享面板呈现，关闭时清理临时文件 |

## 数据流

```
Coordinator
  └─ 注入 PromptAction 列表（设置 / 会话历史）→ Controller.register(actions:)
                            └─ 创建 ViewModel(actions:)
                            └─ 已创建 ViewModel 时调用 updateActions(_:)
                            └─ ViewModel.onSubmit/onHide/onOpenSettings 回调到 Controller
                                                                       └─ 转发给 Coordinator.send(.xxx)
Hotkey → Coordinator.send(.togglePromptPanel) → Controller.toggle()
                                              └─ 显示时 ViewModel.focusSeed += 1（驱动 View 重新聚焦输入框）
键盘事件 → NSEvent 局部监听 → ESC 隐藏
AgentServerHealth.onAvailabilityChange → Controller.setSubmissionEnabled(...)
                                      └─ server 不可用时 ViewModel.submit() 保留 draft，不上抛 onSubmit
```

“会话历史” action 会走 `AppCoordinator.Action.openHistory`，聚焦全局 SessionWindow 并刷新左侧历史列表，不改变 active tab。

## 编辑此目录的约束

- **View 只读 ViewModel**：不要让 View 直接调 `NSEvent` / `NSPanel` / `KeyboardShortcuts.*` API，键盘与窗口副作用全部在 Controller。
- **ViewModel 不持有 SwiftUI 类型**：不要让 `@Observable` class 引入 `View` / `Color` / `Font`；只暴露 plain Swift 状态与回调。
- **Controller 是窗口管理 + 事件监听层**：不直接写消息循环或会话逻辑，所有跨模块意图通过 `onSubmit` / `onOpenSettings` 闭包出口给 Coordinator。App 内快捷键统一由 [Hotkey/AppScopeShortcutDispatcher](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 分发，不在 PromptPanel 内单独维护局部快捷键模型。
- **Action 默认快捷键**：默认值由 [Hotkey/AppScopeShortcutDispatcher](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 在 App 内快捷键模型中写入；PromptPanel 只显示 action 列表，不负责保存快捷键。
- **动态 action 刷新**：Controller 可多次 `register(actions:)`；首次创建 ViewModel，后续只刷新 ViewModel action 列表。新增动态 action 不要覆盖已有用户自定义快捷键。
- **Styles 抽取阈值**：跨 View 复用的样式才放 `PromptPanelStyles.swift`；一次性样式写在 View 里，避免 ViewModifier 爆炸。
- **窗口与拖动区域**：`NSPanel` 自身设为 `isOpaque = false` + `backgroundColor = .clear`，可见背景全部由 SwiftUI `promptPanelContainer()` 的圆角 + ultraThinMaterial 提供，避免顶部"标题栏条"和主体颜色不一致。`isMovableByWindowBackground = true` 让任何空白处都能拖；首行的 input 框宽度固定（左上角紧凑，带 surface 背景与 border），右侧是齿轮按钮，中间留出的 `Spacer` 区域天然成为不显眼的拖动手柄。新增首行控件时不要让控件铺满整行，必须保留中间的拖动空隙。
- **PromptAction.filter 大小写不敏感**：title 与 keywords 两路匹配；新增匹配维度需保持纯函数 + 单元测试。
- **server 不可用时不丢草稿**：`submissionDisabledMessage != nil` 时输入框禁用并显示提示，`submit()` 直接返回，不清空 `draft` / `attachments`。
- **测试**：[PromptPanelViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanelViewModelTests.swift) 覆盖 draft 提交 / 过滤 / action 触发；[PromptActionTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptActionTests.swift) 覆盖过滤逻辑。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并注入 actions。
- 提交 prompt 后由 Coordinator 聚焦或创建全局 [SessionWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md)，再由窗口模型创建会话或向 active tab 发送消息。
- [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) 可用性变化会同步到 `setSubmissionEnabled`，避免重启期间提交新 prompt。
- "打开设置" action 由 Coordinator 路由到 [Settings](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 窗口。
- "会话历史" action 由 Coordinator 路由到 [SessionWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) 的左侧历史列表。
- 全局热键来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md)。
