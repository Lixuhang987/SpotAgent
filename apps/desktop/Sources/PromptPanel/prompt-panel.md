# PromptPanel 模块

全局热键唤起的命令面板：输入普通 prompt，或通过 `ActionDefinition` trigger 渲染 prompt template 并创建新 thread；其中 plugin action 会额外绑定 MCP tools。架构是 **View + ViewModel + Controller + Styles** 四件套。

## 文件

| 文件 | 职责 |
|------|------|
| `PromptPanelView.swift` | 纯 UI：输入框 + action 列表 + 附件 chip（图片 chip 可点击触发 QuickLook 预览）+ server 不可用提示，绑定 ViewModel 状态与 action 选中高亮，消费 Theme token |
| `PromptPanelGrowingTextView.swift` | `NSViewRepresentable` 输入控件：封装 `NSTextView + NSScrollView`，支持自动增高、5 行高度上限、超出后垂直滚动和输入区键盘命令转发 |
| `PromptPanelInputCommand.swift` | 输入区 AppKit command selector 到 PromptPanel 意图的纯解析：Return、Shift/Option+Return、Tab、上下键 |
| `PromptPanelInputLayout.swift` | 输入区布局辅助：根据 `draft` 是否有可见内容决定文字编辑区域宽度，空态只覆盖 placeholder 附近，有内容后占满首行剩余空间 |
| `PromptPanelViewModel.swift` | `@Observable` 状态：`draft` / `focusSeed` / `filteredActions` / `selectedActionId` / `attachments` / `submissionDisabledMessage`；支持 `updateActions(_:)` 刷新 action、上下键切换选中 action、选中 action 提交；`onSubmit` / `onSubmitAction` / `onHide` / `onOpenSettings` / `onPreviewImage` 回调出口 |
| `PromptPanelController.swift` | `NSPanel` 生命周期、ESC 局部监听、ViewModel 注入、持有 `QuickLookPreviewController` |
| `PromptPanelFocusRestorer.swift` | 记录 PromptPanel 唤起前的前台应用，并在面板因失焦或 ESC 收起后恢复应用焦点 |
| `PromptPanelInputFocusRetrier.swift` | 输入框 AppKit 焦点重试器；等待 `NSTextView.window` 可用后设置 `initialFirstResponder` 与当前 first responder |
| `PromptPanelWindow.swift` | `NSPanel` 子类，处理失焦自动隐藏 |
| `PromptPanelStyles.swift` | `PromptPanelContainerModifier` / `ActionRowModifier` / icon button hit area / trigger pill 等 Warm Command Sheet 共享样式 |
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
PromptPanel.show() → 记录当前前台应用 → 激活面板窗口 → 下一轮 runloop 触发 `focusSeed`
PromptPanelGrowingTextView → 若输入框尚未挂到 window，短时重试；挂载后把 `NSTextView` 设为 `initialFirstResponder` 与当前 first responder
PromptPanelGrowingTextView command → PromptPanelInputCommand.resolve
                               ├─ 上/下键 → ViewModel.moveSelectedAction，在当前 filteredActions 内循环选中
                               ├─ Return / Tab → ViewModel.submitSelectedAction
                               └─ Shift/Option + Return → 插入换行
PromptPanel.hide()/失焦隐藏 → 默认恢复唤起前的前台应用焦点
PromptPanel submit handoff → hide(restoringFocus: false) → 不恢复旧前台应用，让 Electron ThreadWindow 保持前台
AgentServerHealth.onAvailabilityChange → Controller.setSubmissionEnabled(...)
                                      └─ server 不可用时 ViewModel.submit() 保留 draft，不上抛 onSubmit
```

`ActionDefinition` 是 PromptPanel 中由 manifest prompt 派生的可选择 action item，类似 Raycast item。当前来源包括：

- skill action：manifest prompt 显式 `kind: "skill"`，提交时只把渲染后的 prompt 作为普通 prompt 创建新 thread。
- plugin action：manifest prompt 默认 `kind` 为 `"plugin"`，提交时渲染 prompt，并携带 `{ pluginId, promptName }` 创建新 thread；agent-server 会重新读取 manifest 校验并激活对应 MCP tool scope。

Action prompt 的参数与提交流程：

1. `ActionInvocation.parse` 用 trigger 匹配 `ActionDefinition`，参数只接受 `[name: value]` 命名块，例如 `r [code: let x = 1] [focus: risk]`。
2. 参数值可以为空，例如 `r [code: ]`；没有参数的 action 可只输入 trigger，例如 `weather`。
3. 上下键只在当前过滤结果中移动 `selectedActionId`，无选中时 Down 从第一项开始、Up 从最后一项开始，并循环切换。
4. 选中 action 时按 Return 或 Tab 会直接提交该 action；如果当前 draft 已是同一 trigger 的参数形式，则复用 draft 参数，否则无参数 action 直接渲染，有必填参数 action 先预填 `trigger [arg: ]` 并显示缺参提示。没有选中 action 时，Return 保持普通 prompt 提交语义。
5. Desktop 本地渲染 `template`。skill action 只提交渲染后的 prompt；plugin action 同时发送 `{ pluginId, promptName }` 作为 `actionBinding`。
6. Coordinator 通过 `thread.start` 强制创建新 thread；Action prompt 不会写入右侧当前展示的既有 thread。
7. agent-server 重新读取同一 plugin manifest 校验绑定，并把 manifest 中的 `mcpServerIds` 持久化到 thread metadata。

## 编辑此目录的约束

- **View 只读 ViewModel**：不要让 View 直接调 `NSEvent` / `NSPanel` / `KeyboardShortcuts.*` API，键盘与窗口副作用全部在 Controller。
- **ViewModel 不持有 SwiftUI 类型**：不要让 `@Observable` class 引入 `View` / `Color` / `Font`；只暴露 plain Swift 状态与回调。
- **Controller 是窗口管理 + 事件监听层**：不直接写消息循环或 thread/turn 逻辑，所有跨模块意图通过 `onSubmit` / `onSubmitAction` / `onOpenSettings` 闭包出口给 Coordinator。全局快捷键注册由 [Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 承接，不在 PromptPanel 内直接绑定 `KeyboardShortcuts`。
- **Action 全局快捷键**：每个 `ActionDefinition` 通过 `shortcutName = "action.<id>"` 获得可配置全局快捷键名；plugin manifest 可通过 prompt 级 `globalShortcut` 声明默认值，用户改过后不覆盖。
- **动态 action 刷新**：Controller 可多次 `register(actions:)`；首次创建 ViewModel，后续只刷新 ViewModel action 列表。Coordinator 同步刷新 Action 全局快捷键注册。新增动态 action 不要覆盖已有用户自定义快捷键。
- **Styles 抽取阈值**：跨 View 复用的样式才放 `PromptPanelStyles.swift`；一次性样式写在 View 里，避免 ViewModifier 爆炸。
- **主题来源**：PromptPanel 的 SwiftUI 视觉由 `AppearanceThemeService.appTheme` 注入的 `AppTheme.light/dark` 决定；`design/tokens.json` 是 token 源，`GeneratedThemeTokens.swift` 是生成产物。`PromptPanelController.updateTheme(_:)` 会刷新已存在面板的 root view，并保留同一个 ViewModel。
- **窗口与拖动区域**：`NSPanel` 自身设为 `isOpaque = false` + `backgroundColor = .clear`，可见背景全部由 SwiftUI `promptPanelContainer()` 的 token 化 command sheet 圆角面板、hairline 描边和柔和阴影提供，避免顶部"标题栏条"和主体颜色不一致。面板可保留 `NSAppearance(.aqua)` 作为 AppKit 控件渲染稳定手段，但这不是固定浅色 UI；SwiftUI 背景、文字、hover、warning/error、chip 和 action row 都必须来自注入的 `AppTheme`。`isMovableByWindowBackground = true` 让任何空白处都能拖；首行左侧 input 不显示独立图标，也不绘制独立卡片、背景或边框，视觉上直接落在面板背景里。`draft` 没有可见内容时 `NSTextView` 只覆盖 placeholder 附近，右侧从文字区域外到设置按钮左侧都保持可拖动背景；`draft` 有可见内容后 input 占满设置按钮左侧剩余空间。新增首行控件时不要破坏这个空态拖动区 / 有内容扩展区切换。
- **焦点语义**：PromptPanel 被唤出后必须立即把首响应者交给输入框。首次启动后第一次打开时，SwiftUI 的 `NSViewRepresentable` 可能晚于面板 `orderFront` 才拿到 `window`，因此焦点建立由 `PromptPanelInputFocusRetrier` 在输入框层短时重试，直到 `NSTextView.window` 可用后同时设置 `initialFirstResponder` 与当前 first responder。如果面板因为点击外侧失焦，或因 ESC / 全局快捷键收起，必须把焦点返还给唤起前的前台应用。提交 prompt 时是 Electron ThreadWindow handoff，Coordinator 必须在发送 `thread_window.open_initial_prompt` 前调用 `hide(restoringFocus: false)`，避免 `orderOut` / `onDidResignKey` 重入恢复旧前台应用并把刚显示的 Electron ThreadWindow 推到后台。恢复逻辑只做本地窗口激活，不向 thread 注入任何 App 上下文。
- **Warm Command Sheet 视觉风格**：PromptPanel 使用 `DESIGN.md` 的 warm canvas / coral emphasis / dark product surface 语言，并支持 light/dark 主题。容器、输入 placeholder/disabled、设置按钮 hover、附件 chip、server banner、action row、trigger pill 和 empty state 都走 `theme.colors.*`、`theme.spacing.*`、`theme.radius.*`；附件 chip 区分普通文本、图片预览和 selection error，server 不可用使用 warning 语义，Action 渲染失败或缺必填参数使用 error 语义。
- **输入框高度与键盘语义**：PromptPanel 输入使用 `PromptPanelGrowingTextView` 包装 AppKit `NSTextView + NSScrollView`。输入框随文本自动增高，最多显示 5 行；超过 5 行后固定高度并出现垂直滚动条。普通 Return 在有选中 action 时提交选中 action、否则提交当前 draft；Shift/Option + Return 插入换行；上下键切换 action 选中；选中 action 时 Tab 同样提交选中 action。
- **Action 匹配大小写不敏感**：trigger 使用前缀匹配，title / description 使用包含匹配；当 draft 是 `trigger ...` 参数形式时仍匹配同一 action；trigger 冲突按 plugin id 稳定排序保留第一个。
- **server 不可用时不丢草稿**：`submissionDisabledMessage != nil` 时输入框禁用并显示提示，`submit()` 直接返回，不清空 `draft` / `attachments`。
- **测试**：[PromptPanelViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift) 覆盖普通 draft 提交 / 过滤 / skill/plugin action 提交 / action 选中与选中提交；[PromptPanelInputCommandTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/PromptPanelInputCommandTests.swift) 覆盖 Return / Shift 或 Option+Return / Tab / 上下键 command 解析；[PromptPanelInputLayoutTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/PromptPanelInputLayoutTests.swift) 覆盖空态保留拖动空隙、有内容占满剩余宽度的判断；[ActionDefinitionTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionDefinitionTests.swift)、[ActionInvocationTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionInvocationTests.swift)、[ActionManifestStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/PromptPanel/ActionManifestStoreTests.swift) 覆盖 manifest 校验、trigger 解析和目录读取。

## 与其他模块的关系

- 由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并注入 actions。
- 提交 prompt 后由 Coordinator 通过 [ElectronThreadWindowLifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift) 发送 `thread_window.open_initial_prompt`；Electron main 展示 React ThreadWindow 并注入 initial prompt，React 通过 `/api/thread` 创建新 thread 并提交首轮 `input.submit`。右侧当前展示的既有 thread 不会接收 PromptPanel 的初始提交。
- [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) 可用性变化会同步到 `setSubmissionEnabled`，避免重启期间提交新 prompt。
- 全局热键来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md)。
