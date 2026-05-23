# Hotkey 模块

快捷键分为固定系统入口快捷键和 Action 全局快捷键两类，配置模型基于 [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库。

## 文件

| 文件 | 职责 |
|------|------|
| `GlobalShortcutNames.swift` | 定义固定系统入口 `KeyboardShortcuts.Name` 扩展（唤起面板 / 捕获文本选区 / 圈选区域截图） |
| `NamedHotkeyRegistrar.swift` | 对 `KeyboardShortcuts.Name` 建立可测试的全局注册层；监听快捷键配置变更并重新绑定运行中的 handler |
| `ActionShortcutDefaults.swift` | Action 快捷键默认值写入与测试辅助；不直接监听 AppKit 局部键盘事件 |

## 架构

### 固定系统入口快捷键

- `KeyboardShortcuts.Name.showPromptPanel`，默认 ⌘⇧Space，回调 `send(.togglePromptPanel)`。
- `KeyboardShortcuts.Name.captureSelection`，无默认值；按下后调用 `MacSelectionCaptureProvider`，把结果作为 `textSelection` chip 推入 PromptPanel 并自动唤起。
- `KeyboardShortcuts.Name.captureRegion`，无默认值；按下后调用 `MacRegionCaptureProvider`（基于 `screencapture -i`）；用户取消圈选时不弹面板，截图成功则把 PNG base64 作为 `imageRegion` chip 推入 PromptPanel 并自动唤起。
- 注册位置统一在 [Coordinator.setupHotkey()](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md)。
- 生产实现由 `ProductionHotkeyRegistrar` 委托 `NamedHotkeyRegistrar` 绑定。`NamedHotkeyRegistrar` 订阅 `KeyboardShortcuts_shortcutByNameDidChange`，同名快捷键变更后会移除旧 handler 并按新配置重新绑定，运行中的 App 不需要重启。
- 库内部使用 Carbon Events 注册系统级热键；用户自定义值由库自动持久化到 UserDefaults，并在写入后发出同名快捷键变更通知。

### Action 全局快捷键

- 每个 `ActionDefinition` 通过 `shortcutName` 计算属性生成 `KeyboardShortcuts.Name("action.<id>")`。
- Action 快捷键使用 `KeyboardShortcuts.Recorder` 配置，存储仍由 KeyboardShortcuts 写入 UserDefaults。
- Action 快捷键是系统级全局快捷键，由 `ProductionHotkeyRegistrar.registerActionShortcut(...)` 注册。
- 默认值来自 plugin manifest prompt 级 `globalShortcut`，仅当用户未自定义时写入。
- Action 快捷键触发后由 Coordinator 根据 `ActionDefinition.submission` 决定行为：无必填参数的 skill/plugin 直接创建 session；有必填参数的 skill/plugin 打开 PromptPanel 并预填 `trigger [arg: ]`。

### 设置界面

- 由 [Settings/ShortcutSettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 渲染，上下分为“全局快捷键”和“Action 快捷键”两栏，二者都用 `KeyboardShortcuts.Recorder` 配置。

## 编辑此目录的约束

- 新增固定系统入口快捷键：在此处加 `Name` 扩展并设默认值；注册位置统一在 Coordinator，不要散到其他模块。
- Action 快捷键命名格式 `action.<actionId>` 不要改，否则旧用户的 UserDefaults 会失效。
- 不要把 `KeyboardShortcuts.Recorder` 散布到非 Settings 模块。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 注册全局热键回调。
- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 构建 `ActionDefinition` 列表并注册 Action 全局快捷键。
- [Settings](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 提供配置 UI。
