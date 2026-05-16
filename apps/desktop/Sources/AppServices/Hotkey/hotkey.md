# Hotkey 模块

全局快捷键与 PromptAction 快捷键，基于 [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库。

## 文件

| 文件 | 职责 |
|------|------|
| `GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展（全局热键名称与默认值） |

## 架构

### 全局热键

- 通过 `KeyboardShortcuts.Name.showPromptPanel` 定义，默认 Cmd+Shift+Space
- `AppDelegate.applicationDidFinishLaunching` 中调用 `KeyboardShortcuts.onKeyUp(for:)` 注册监听
- 库内部使用 Carbon Events API 注册系统级热键
- 用户自定义值自动存储在 UserDefaults 中（由库管理）

### Action 快捷键（局部）

- 每个 `PromptAction` 通过 `shortcutName` 属性生成 `KeyboardShortcuts.Name("action.\(id)")`
- 不注册全局监听，仅在 PromptPanel 可见时通过本地事件监听匹配
- 匹配方式：`KeyboardShortcuts.Shortcut(event:)` 构造后与存储值 `==` 比较
- 默认值在 `PromptPanelController.register(actions:)` 中设置（仅当用户未自定义时）

### 设置界面

- 全局热键：`KeyboardShortcuts.Recorder(name: .showPromptPanel)` — 录制后自动生效
- Action 快捷键：`KeyboardShortcuts.Recorder(name: action.shortcutName)` — 录制后下次匹配生效

## 与其他模块的关系

- `HandAgentApp.swift` 注册全局热键回调
- `PromptPanelController`（PromptPanel 模块）注册 action 默认值并做局部匹配
- `Settings/ShortcutSettingsView` 提供配置 UI
