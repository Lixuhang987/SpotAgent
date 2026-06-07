# PromptPanel 模块

全局热键唤起的命令面板：输入普通 prompt，或通过 `ActionDefinition` trigger 渲染 prompt template 并创建新 thread；其中 plugin action 会额外绑定 MCP tools。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `PromptPanelView.swift` | 纯 UI：输入框 + action 列表 + 附件 chip（图片 chip 可点击触发 QuickLook 预览）+ server 不可用提示，绑定 ViewModel 状态，消费 Theme token |
| `PromptPanelGrowingTextView.swift` | `NSViewRepresentable` 输入控件：封装 `NSTextView + NSScrollView`，支持自动增高、5 行高度上限和超出后垂直滚动 |
| `PromptPanelInputLayout.swift` | 输入区布局辅助：根据 `draft` 是否有可见内容决定文字编辑区域宽度，空态只覆盖 placeholder 附近，有内容后占满首行剩余空间 |
| `PromptPanelViewModel.swift` | `@Observable` 状态：`draft` / `focusSeed` / `filteredActions` / `attachments` / `submissionDisabledMessage`；支持 `updateActions(_:)` 刷新 action；`onSubmit` / `onSubmitAction` / `onHide` / `onOpenSettings` / `onPreviewImage` 回调出口 |
| `PromptPanelController.swift` | `NSPanel` 生命周期、ESC 局部监听、ViewModel 注入、持有 `QuickLookPreviewController` |
| `PromptPanelWindow.swift` | `NSPanel` 子类，处理失焦自动隐藏 |
| `PromptPanelStyles.swift` | `PromptPanelContainerModifier` / `ActionRowModifier` |
| `PromptAttachmentResult.swift` | `PromptAttachmentResult` 枚举；描述 PromptPanel 提交时附带的用户主动输入附件 |
| `ActionDefinition.swift` | PromptPanel item 统一定义：trigger、参数、全局快捷键、提交行为、plugin binding、manifest 校验与 trigger 冲突处理 |
| `ActionManifestStore.swift` | 从 `~/.spotAgent/plugins/*/plugin.json` 读取 Action manifests |
| `ActionInvocation.swift` | trigger / `[name: value]` 参数解析与 `template` 渲染 |
| `QuickLookPreviewController.swift` | 把 `imageRegion` 的 base64 写入 `NSTemporaryDirectory()`，通过 `QLPreviewPanel` 共享面板呈现，关闭时清理临时文件 |

## 数据流

```
Coordinator
  └─ 读取 ActionManifestStore → Controller.register(actions:)
                            └─ 创建 ViewModel(actions:)
                            └─ 已创建 ViewModel 时调用 updateActions(_:)
                            └─ ViewModel.onSubmit/onSubmitAction/onHide/onOpenSettings 回调到 Controller
                                                                       └─ 转发给 Coordinator.send(.xxx)
Hotkey → Coordinator.send(.togglePromptPanel) → Controller.toggle()
                                              └─ 显示时 ViewModel.focusSeed += 1（驱动 View 重新聚焦输入框）
ActionShortcut → Coordinator.performActionShortcut(ActionDefinition)
              ├─ 无必填参数 skill/plugin：直接渲染并创建 thread
              └─ 有必填参数 skill/plugin：打开 PromptPanel 并预填 `trigger [arg: ]`
键盘事件 → NSEvent 局部监听 → ESC 隐藏
AgentServerHealth.onAvailabilityChange → Controller.setSubmissionEnabled(...)
                                      └─ server 不可用时 ViewModel.submit() 保留 draft，不上抛 onSubmit
```

`ActionDefinition` 是 PromptPanel 中由 manifest prompt 派生的可选择 action item，类似 Raycast item。当前来源包括：

- skill action：manifest prompt 显式 `kind: "skill"`，提交时只把渲染后的 prompt 作为普通 prompt 创建新 thread。
- plugin action：manifest prompt 默认 `kind` 为 `"plugin"`，提交时渲染 prompt，并携带 `{ pluginId, promptName }` 创建新 thread；agent-server 会重新读取 manifest 校验并激活对应 MCP tool scope。

Action prompt 的参数与提交流程：

1. `ActionInvocation.parse` 用 trigger 匹配 `ActionDefinition`，参数只接受 `[name: value]` 命名块，例如 `r [code: let x = 1] [focus: risk]`。
2. 参数值可以为空，例如 `r [code: ]`；没有参数的 action 可只输入 trigger，例如 `weather`。
3. Desktop 本地渲染 `template`。skill action 只提交渲染后的 prompt；plugin action 同时发送 `{ pluginId, promptName }` 作为 `actionBinding`。
4. Coordinator 通过 `thread.start` 强制创建新 thread；Action prompt 不会写入当前 active tab。
5. agent-server 重新读取同一 plugin manifest 校验绑定，并把 manifest 中的 `mcpServerIds` 持久化到 thread metadata。

## 编辑此目录的约束

- **View 只读 ViewModel**：不要让 View 直接调 `NSEvent` / `NSPanel` / `KeyboardShortcuts.*` API，键盘与窗口副作用全部在 Controller。
- **ViewModel 不持有 SwiftUI 类型**：不要让 `@Observable` class 引入 `View` / `Color` / `Font`；只暴露 plain Swift 状态与回调。
- **Controller 是窗口管理 + 事件监听层**：不直接写消息循环或 thread/turn 逻辑，所有跨模块意图通过 `onSubmit` / `onSubmitAction` / `onOpenSettings` 闭包出口给 Coordinator。全局快捷键注册由 [Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 承接，不在 PromptPanel 内直接绑定 `KeyboardShortcuts`。
- **Action 全局快捷键**：每个 `ActionDefinition` 通过 `shortcutName = "action.<id>"` 获得可配置全局快捷键名；plugin manifest 可通过 prompt 级 `globalShortcut` 声明默认值，用户改过后不覆盖。
- **动态 action 刷新**：Controller 可多次 `register(actions:)`；首次创建 ViewModel，后续只刷新 ViewModel action 列表。Coordinator 同步刷新 Action 全局快捷键注册。新增动态 action 不要覆盖已有用户自定义快捷键。
- **Styles 抽取阈值**：跨 View 复用的样式才放 `PromptPanelStyles.swift`；一次性样式写在 View 里，避免 ViewModifier 爆炸。
- **窗口与拖动区域**：`NSPanel` 自身设为 `isOpaque = false` + `backgroundColor = .clear`，可见背景全部由 SwiftUI `promptPanelContainer()` 的 warm cream 圆角面板、hairline 描边和柔和阴影提供，避免顶部"标题栏条"和主体颜色不一致。`isMovableByWindowBackground = true` 让任何空白处都能拖；首行左侧 input 不显示独立图标，也不绘制独立卡片、背景或边框，视觉上直接落在面板背景里。`draft` 没有可见内容时 `NSTextView` 只覆盖 placeholder 附近，右侧从文字区域外到设置按钮左侧都保持可拖动背景；`draft` 有可见内容后 input 占满设置按钮左侧剩余空间。新增首行控件时不要破坏这个空态拖动区 / 有内容扩展区切换。
- **视觉风格**：PromptPanel 使用 `DESIGN.md` 的 cream canvas、coral emphasis、warm card hover 状态；附件 chip、server 不可用提示和 action hover 都走 `Theme` token，不回退到旧暗色玻璃或 Mango Amber。
- **输入框高度**：PromptPanel 输入使用 `PromptPanelGrowingTextView` 包装 AppKit `NSTextView + NSScrollView`。输入框随文本自动增高，最多显示 5 行；超过 5 行后固定高度并出现垂直滚动条。普通 Return 提交；Shift/Option + Return 插入换行。
- **Action 匹配大小写不敏感**：trigger 使用前缀匹配，title / description 使用包含匹配；trigger 冲突按 plugin id 稳定排序保留第一个。
- **server 不可用时不丢草稿**：`submissionDisabledMessage != nil` 时输入框禁用并显示提示，`submit()` 直接返回，不清空 `draft` / `attachments`。
- **测试**：[PromptPanelViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift) 覆盖普通 draft 提交 / 过滤 / skill/plugin action 提交；[PromptPanelInputLayoutTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/PromptPanelInputLayoutTests.swift) 覆盖空态保留拖动空隙、有内容占满剩余宽度的判断；[ActionDefinitionTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionDefinitionTests.swift)、[ActionInvocationTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionInvocationTests.swift)、[ActionManifestStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionManifestStoreTests.swift) 覆盖 manifest 校验、trigger 解析和目录读取。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并注入 actions。
- 提交 prompt 后由 Coordinator 聚焦或创建全局 [ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md)，再由窗口模型创建新的 thread tab；当前 active tab 不会接收 PromptPanel 的初始提交。
- [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) 可用性变化会同步到 `setSubmissionEnabled`，避免重启期间提交新 prompt。
- 全局热键来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md)。
