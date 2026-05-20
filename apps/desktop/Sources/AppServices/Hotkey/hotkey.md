# Hotkey 模块

快捷键分为“全局快捷键”和“App 内快捷键”两类，配置模型基于 [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库。

## 文件

| 文件 | 职责 |
|------|------|
| `GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展（全局热键名称与默认值） |
| `NamedHotkeyRegistrar.swift` | 对 `KeyboardShortcuts.Name` 建立可测试的注册层；监听快捷键配置变更并重新绑定运行中的全局 handler |
| `AppScopeShortcutDispatcher.swift` | App 内快捷键默认值与分发；读取 KeyboardShortcuts 存储，使用 AppKit 本地事件在 App 激活范围内触发 |

## 架构

### 全局热键

- `KeyboardShortcuts.Name.showPromptPanel`，默认 ⌘⇧Space，回调 `send(.togglePromptPanel)`。
- `KeyboardShortcuts.Name.captureSelection`，无默认值；按下后调用 `MacSelectionCaptureProvider`，把结果作为 `textSelection` chip 推入 PromptPanel 并自动唤起。
- `KeyboardShortcuts.Name.captureRegion`，无默认值；按下后调用 `MacRegionCaptureProvider`（基于 `screencapture -i`）；用户取消圈选时不弹面板，截图成功则把 PNG base64 作为 `imageRegion` chip 推入 PromptPanel 并自动唤起。
- 注册位置统一在 [Coordinator.setupHotkey()](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md)。
- 生产实现由 `ProductionHotkeyRegistrar` 委托 `NamedHotkeyRegistrar` 绑定。`NamedHotkeyRegistrar` 订阅 `KeyboardShortcuts_shortcutByNameDidChange`，同名快捷键变更后会移除旧 handler 并按新配置重新绑定，运行中的 App 不需要重启。
- 库内部使用 Carbon Events 注册系统级热键；用户自定义值由库自动持久化到 UserDefaults，并在写入后发出同名快捷键变更通知。

### App 内快捷键

- 每个 `PromptAction` 通过 `shortcutName` 计算属性生成 `KeyboardShortcuts.Name("action.\(id)")`。
- App 内快捷键仍使用 `KeyboardShortcuts.Recorder` 做配置，存储仍由 KeyboardShortcuts 写入 UserDefaults。
- App 内快捷键不属于“各处唤起”的系统级全局快捷键；写入或显示后统一调用 `KeyboardShortcuts.disable(...)` 解除 Carbon 全局注册。
- 触发由 `AppScopeShortcutDispatcher` 通过 `NSEvent.addLocalMonitorForEvents` 在 App 激活范围内分发，构造 `KeyboardShortcuts.Shortcut(event:)` 与已存值比较匹配。
- 默认值在 `AppScopeShortcutDispatcher.start(actions:)` 中写入，**仅当用户未自定义时**才设置。
- 当前 App 内快捷键包括「打开设置」与「会话历史」等宿主动作；它们不再归属于 PromptPanel 局部快捷键模型。

### 设置界面

- 由 [Settings/ShortcutSettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 渲染，上下分为“全局快捷键”和“App 内快捷键”两栏，二者都用 `KeyboardShortcuts.Recorder` 配置。

## 编辑此目录的约束

- 新增全局热键：在此处加 `Name` 扩展并设默认值；注册位置统一在 Coordinator，不要散到其他模块。
- App 内快捷键命名格式 `action.<actionId>` 不要改，否则旧用户的 UserDefaults 会失效。
- 不要把 `KeyboardShortcuts.Recorder` 散布到非 Settings 模块。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 注册全局热键回调。
- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有 `AppScopeShortcutDispatcher` 并注册 App 内快捷键分发。
- [Settings](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 提供配置 UI。
