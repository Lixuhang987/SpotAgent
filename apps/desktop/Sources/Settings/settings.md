# Settings 模块

设置窗口的容器与各 Tab 视图。当前三个 Tab：模型配置（代理 `AgentSettingsStore`）、快捷键配置（KeyboardShortcuts.Recorder）、工作区管理（代理 `WorkspaceSettingsViewModel`）。窗口本身由 Coordinator 用 `NSWindow + NSHostingController` 管理（不使用 SwiftUI `Settings` scene，因为需要主动 `openOrFocus` 控制）。

## 文件

| 文件 | 职责 |
|------|------|
| `SettingsView.swift` | `TabView` 容器，挂"模型" / "快捷键" / "工作区"三个 Tab，统一暗色背景 |
| `AgentSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.settings` 包装成可双向绑定的属性，写时自动 trim |
| `ShortcutSettingsView.swift` | 全局热键 + PromptAction 快捷键的 `KeyboardShortcuts.Recorder` 列表 |
| `WorkspaceSettingsView.swift` | 工作区列表 + 添加 / 编辑 / 删除 UI；NSOpenPanel 选目录 + 表单 sheet |
| `WorkspaceSettingsViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/workspaces.json`（与 core 侧 `FileWorkspaceRegistry` 共享文件） |
| `SettingsStyles.swift` | 共享样式：`SettingsTabBar`、`SettingsSection`、`SettingsRow`、`SettingsRowDivider`、`SettingsFieldStyle`、`SettingsSectionSeparator` |

模型设置的具体 UI 在 [AppServices/AgentSettings/AgentSettingsView.swift](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift)（历史遗留，未来应迁回 `Sources/Settings/`），由本模块的 SettingsView 嵌入。

## 数据流

```
Coordinator.send(.openSettings)
  └─ SettingsLifecycle.openOrFocus(...)
       └─ SettingsView(settingsViewModel:, shortcutActions:, workspaceViewModel:)
            ├─ AgentSettingsView(viewModel:)        // → AgentSettingsStore.update → 写 ~/.spotAgent/settings.json
            ├─ ShortcutSettingsView(actions:)       // KeyboardShortcuts.Recorder 直写 UserDefaults
            └─ WorkspaceSettingsView(viewModel:)    // → 写 ~/.spotAgent/workspaces.json，agent-server 启动时由 FileWorkspaceRegistry 重新加载
  └─ 生产 presenter 监听 NSWindow.willCloseNotification → Coordinator.send(.settingsWindowClosed)
```

`~/.spotAgent/workspaces.json` 是 desktop（写）与 agent-server（读，启动时一次）共享的注册表文件；当前版本 desktop 写入后需要重启 agent-server 子进程才能让 LLM 看到新 workspace（无 watcher）。
`~/.spotAgent/settings.json` 中已有 `tools.allowlist / tools.denylist` loader，但当前 Settings UI 只暴露模型、快捷键和工作区三个 Tab；tool 管理 UI 与 agent-server registry 热加载仍在 TODO 中。

## 编辑此目录的约束

- **ViewModel 是 Store 的代理层**：不缓存值；getter 透传 `store.settings.xxx`，setter 调 `store.update`。新增字段顺序：`AgentSettings` → `AgentSettingsStore.update` 已支持 → ViewModel 加属性 → AgentSettingsView 加 UI。
- **写入时统一 trim**：所有字符串字段在 setter 里 `trimmingCharacters(in: .whitespacesAndNewlines)`，避免空白污染 settings.json。
- **不要把 store 直接传给 View**：始终经过 ViewModel；测试也是 `AgentSettingsViewModel(store:)`。
- **Tab 增加规则**：新建 Tab 在 `SettingsView` 内增 `Tab(...)`；Tab 内如果有副作用则配套加 ViewModel；纯展示可直接写 View。
- **视觉风格**：设置页面使用 `settingsCard()` 卡片容器 + `SettingsFieldStyle` 输入框 + `SettingsRow` 行布局，与 PromptPanel / SessionWindow 保持统一暗色玻璃风格。不要使用系统 `Form` / `GroupBox` / `.grouped` 样式。窗口标题栏设为透明 + fullSizeContentView，与 SessionWindow 一致。
- **不要在 Settings 里读 LLM/tool 运行态**：宿主层不组装 LLM 消息，`api`/`baseURL`/`apiKey` 只是写入 settings.json；agent-server 侧每次模型请求自己读模型配置，tool settings 当前只在 server 启动时读取。
- **测试**：[AgentSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift) 用临时 home 目录验证读写串通；[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AgentSettingsStoreTests.swift) 覆盖磁盘 IO + 轮询。

## 与其他模块的关系

- Store 在 [AppServices/AgentSettings](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)，由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有。
- 快捷键名来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 与 [PromptPanel/PromptAction](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)。
- 设置窗口的开/关会触发 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 中的激活策略切换。
