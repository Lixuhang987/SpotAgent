# Hotkey 模块

全局快捷键与 PromptAction 快捷键的命名约定，基于 [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库。

## 文件

| 文件 | 职责 |
|------|------|
| `GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展（全局热键名称与默认值） |

## 架构

### 全局热键

- `KeyboardShortcuts.Name.showPromptPanel`，默认 ⌘⇧Space。
- 在 [Coordinator.setupHotkey()](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 中调用 `KeyboardShortcuts.onKeyUp(for:)` 注册监听，回调 `send(.togglePromptPanel)`。
- 库内部使用 Carbon Events 注册系统级热键；用户自定义值由库自动持久化到 UserDefaults。

### Action 快捷键（局部）

- 每个 `PromptAction` 通过 `shortcutName` 计算属性生成 `KeyboardShortcuts.Name("action.\(id)")`。
- **不注册全局监听**；仅在 PromptPanel 可见时通过 `NSEvent.addLocalMonitorForEvents` 拦截 keyDown，构造 `KeyboardShortcuts.Shortcut(event:)` 与已存值比较匹配。
- 默认值在 [PromptPanelController.register(actions:)](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) 中写入，**仅当用户未自定义时**才设置。

### 设置界面

- 由 [Settings/ShortcutSettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 渲染，使用 `KeyboardShortcuts.Recorder`。

## 编辑此目录的约束

- 新增全局热键：在此处加 `Name` 扩展并设默认值；注册位置统一在 Coordinator，不要散到其他模块。
- Action 快捷键命名格式 `action.<actionId>` 不要改，否则旧用户的 UserDefaults 会失效。
- 不要把 `KeyboardShortcuts.Recorder` 散布到非 Settings 模块。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 注册全局热键回调。
- [PromptPanel Controller](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) 注册默认值并做局部匹配。
- [Settings](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 提供配置 UI。
