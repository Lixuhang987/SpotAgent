# 快捷键系统重构：引入 KeyboardShortcuts 库

## 背景

当前快捷键系统使用自定义 Carbon Events API 封装（`HotkeyService`）注册全局热键，自定义 `KeyShortcut` 数据模型，自定义 `ShortcutRecorderView` 录制控件，以及 `ShortcutSettingsStore` 管理持久化。系统存在全局热键无法唤起 PromptPanel 的 bug，且维护成本高。

## 目标

用 [sindresorhus/KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库替换全部自定义快捷键基础设施，统一全局热键和局部 action 快捷键的存储与 UI。

## 设计

### 两类快捷键的处理方式

| 类型 | 注册方式 | 触发方式 | 存储 |
|------|----------|----------|------|
| 全局热键（showPromptPanel） | `KeyboardShortcuts.onKeyUp(for:)` | 库自动派发回调 | 库管理（UserDefaults） |
| Action 快捷键（局部） | 不注册全局监听 | PromptPanelController 本地事件监听中手动匹配 | 库管理（UserDefaults） |

两者都通过 `KeyboardShortcuts.Name` 定义槽位，区别仅在于是否调用 `onKeyUp/onKeyDown` 注册全局监听。

### Name 定义

```swift
// Hotkey/GlobalShortcutNames.swift
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let showPromptPanel = Self(
        "showPromptPanel",
        default: .init(.space, modifiers: [.command, .shift])
    )
}
```

Action 快捷键的 Name 动态创建，以 action ID 为标识：

```swift
// PromptAction 注册时
let name = KeyboardShortcuts.Name("action.\(action.id)")
// 如果 action 有 defaultShortcut，设置初始值
if let defaultShortcut = action.defaultShortcut {
    KeyboardShortcuts.Name("action.\(action.id)", default: defaultShortcut)
}
```

### 全局热键监听

```swift
// AppDelegate.applicationDidFinishLaunching 中
KeyboardShortcuts.onKeyUp(for: .showPromptPanel) { [weak promptPanelController] in
    promptPanelController?.show()
}
```

替代原来的 `HotkeyService.start()` + `onTrigger` 回调。

### Action 快捷键匹配

PromptPanelController 保持本地事件监听，匹配逻辑改为：

```swift
guard let eventShortcut = KeyboardShortcuts.Shortcut(event: event) else { return event }

for action in actions {
    let name = KeyboardShortcuts.Name("action.\(action.id)")
    guard let shortcut = KeyboardShortcuts.getShortcut(for: name) else { continue }
    if shortcut == eventShortcut {
        action.perform()
        hide()
        return nil
    }
}
```

`Shortcut(event:)` 从 NSEvent 构造实例，直接用 `==` 比较（Hashable 一致性由库保证）。

### 设置界面

```swift
// ShortcutSettingsView.swift
Form {
    Section("全局快捷键") {
        KeyboardShortcuts.Recorder("唤起 PromptPanel", name: .showPromptPanel)
    }

    Section("PromptAction 快捷键") {
        ForEach(actions) { action in
            KeyboardShortcuts.Recorder(action.title, name: .init("action.\(action.id)"))
        }
    }
}
```

### PromptAction 模型变更

```swift
struct PromptAction: Identifiable {
    let id: String
    let title: String
    let keywords: [String]
    let defaultShortcut: KeyboardShortcuts.Shortcut?  // 类型从 KeyShortcut? 改为此
    let perform: () -> Void
}
```

`shortcut(using:)` 和 `shortcutDisplay(using:)` 方法删除，改为直接通过 `KeyboardShortcuts.getShortcut(for:)` 获取。

## 文件变更清单

### 删除

| 文件 | 原因 |
|------|------|
| `AppServices/Hotkey/HotkeyService.swift` | 被 `KeyboardShortcuts.onKeyUp` 替代 |
| `AppServices/Hotkey/KeyShortcut.swift` | 被 `KeyboardShortcuts.Shortcut` 替代 |
| `AppServices/Hotkey/ShortcutSettingsStore.swift` | 存储完全交给库 |
| `Settings/ShortcutRecorderView.swift` | 被 `KeyboardShortcuts.Recorder` 替代 |

### 新增

| 文件 | 职责 |
|------|------|
| `AppServices/Hotkey/GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展 |

### 修改

| 文件 | 变更 |
|------|------|
| `Package.swift` | 添加 KeyboardShortcuts SPM 依赖 |
| `AppServices/AppServices.swift` | 移除 `hotkeyService` 和 `shortcutSettingsStore`，注册全局热键监听 |
| `HandAgentApp.swift` | 移除 `ShortcutSettingsStore` 相关接线 |
| `PromptPanel/PromptAction.swift` | `defaultShortcut` 类型改为 `KeyboardShortcuts.Shortcut?`，删除 `shortcut(using:)`/`shortcutDisplay(using:)` |
| `PromptPanel/PromptPanelController.swift` | 移除 `shortcutSettingsStore` 依赖，匹配逻辑改用 `KeyboardShortcuts.getShortcut(for:)` |
| `Settings/ShortcutSettingsView.swift` | 全部改用 `KeyboardShortcuts.Recorder` |
| `AppServices/Hotkey/hotkey.md` | 更新文档 |

## 测试验证

- 全局热键 Cmd+Shift+Space 唤起 PromptPanel
- 设置界面录制新的全局快捷键后立即生效
- Action 快捷键仅在 PromptPanel 可见时触发
- 设置界面录制新的 action 快捷键后立即生效
- App 重启后快捷键配置保持

## 不在范围内

- 快捷键冲突检测 UI（KeyboardShortcuts 内置了系统级冲突警告，够用）
- 迁移旧 UserDefaults 数据（key 不同，旧配置自动失效，用户重新设置即可）
