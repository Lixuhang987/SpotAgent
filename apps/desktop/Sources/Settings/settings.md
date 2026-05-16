# Settings 模块

设置窗口的容器与各 Tab 视图。当前两个 Tab：模型配置（代理 `AgentSettingsStore`）、快捷键配置（KeyboardShortcuts.Recorder）。窗口本身由 Coordinator 用 `NSWindow + NSHostingController` 管理（不使用 SwiftUI `Settings` scene，因为需要主动 `openOrFocus` 控制）。

## 文件

| 文件 | 职责 |
|------|------|
| `SettingsView.swift` | `TabView` 容器，挂"模型" + "快捷键"两个 Tab |
| `AgentSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.settings` 包装成可双向绑定的属性，写时自动 trim |
| `ShortcutSettingsView.swift` | 全局热键 + PromptAction 快捷键的 `KeyboardShortcuts.Recorder` 列表 |

模型设置的具体 UI 在 [AppServices/AgentSettings/AgentSettingsView.swift](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift)，由本模块的 SettingsView 嵌入。

## 数据流

```
Coordinator.openOrFocusSettingsWindow
  └─ makeSettingsWindow()
       └─ SettingsView(settingsViewModel: makeSettingsViewModel(), shortcutActions: makeShortcutActions())
            └─ AgentSettingsView(viewModel:)  // 双向绑定 → ViewModel.set → Store.update → 写 ~/.spotAgent/settings.json
            └─ ShortcutSettingsView(actions:) // KeyboardShortcuts.Recorder 直写 UserDefaults
  └─ 监听 NSWindow.willCloseNotification → Coordinator.send(.settingsWindowClosed)
```

## 编辑此目录的约束

- **ViewModel 是 Store 的代理层**：不缓存值；getter 透传 `store.settings.xxx`，setter 调 `store.update`。新增字段顺序：`AgentSettings` → `AgentSettingsStore.update` 已支持 → ViewModel 加属性 → AgentSettingsView 加 UI。
- **写入时统一 trim**：所有字符串字段在 setter 里 `trimmingCharacters(in: .whitespacesAndNewlines)`，避免空白污染 settings.json。
- **不要把 store 直接传给 View**：始终经过 ViewModel；测试也是 `AgentSettingsViewModel(store:)`。
- **Tab 增加规则**：新建 Tab 在 `SettingsView` 内增 `Tab(...)`；Tab 内如果有副作用则配套加 ViewModel；纯展示可直接写 View。
- **不要在 Settings 里读 LLM/tool 状态**：宿主层不组装 LLM 消息，`api`/`baseURL`/`apiKey` 只是写入 settings.json；agent-server 侧每次请求自己读。
- **测试**：[AgentSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift) 用临时 home 目录验证读写串通；[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AgentSettingsStoreTests.swift) 覆盖磁盘 IO + 轮询。

## 与其他模块的关系

- Store 在 [AppServices/AgentSettings](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)，由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有。
- 快捷键名来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 与 [PromptPanel/PromptAction](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)。
- 设置窗口的开/关会触发 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 中的激活策略切换。
