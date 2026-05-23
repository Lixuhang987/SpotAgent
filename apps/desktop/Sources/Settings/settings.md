# Settings 模块

设置窗口的容器与各 Tab 视图。当前五个 Tab：模型配置（代理 `AgentSettingsStore`）、工具管理（代理 `ToolSettingsViewModel`）、权限规则管理（代理 `PermissionRulesViewModel`）、快捷键配置（全局快捷键 / Action 快捷键两栏，均使用 KeyboardShortcuts.Recorder）、工作区管理（代理 `WorkspaceSettingsViewModel`）。窗口本身由 Coordinator 用 `NSWindow + NSHostingController` 管理（不使用 SwiftUI `Settings` scene，因为需要主动 `openOrFocus` 控制）。

## 文件

| 文件 | 职责 |
|------|------|
| `SettingsView.swift` | 设置容器，挂"模型" / "工具" / "权限" / "快捷键" / "工作区"五个 Tab，统一暗色背景 |
| `AgentSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.settings` 包装成可双向绑定的属性，写时自动 trim |
| `ToolSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.toolSettings` 包装成工具目录 + 启用/禁用切换，写时自动同步到 `settings.json` |
| `ToolSettingsView.swift` | 工具管理 UI：builtin tool 列表、风险提示、开关切换 |
| `PermissionRulesViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/permissions.json`，展示永久规则并支持按 `argHash` 撤销 |
| `PermissionRulesView.swift` | 权限规则 UI：toolName / decision / createdAt / 参数摘要列表 + 撤销按钮 |
| `ShortcutSettingsView.swift` | 快捷键配置 UI；上栏是固定系统入口“全局快捷键”，下栏是 `ActionDefinition` 派生的“Action 快捷键”，两栏都用 `KeyboardShortcuts.Recorder` |
| `WorkspaceSettingsView.swift` | 工作区列表 + 添加 / 编辑 / 删除 UI；SwiftUI `fileImporter` 选目录 + 表单 sheet |
| `WorkspaceSettingsViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/workspaces.json`（与 core 侧 `FileWorkspaceRegistry` 共享文件） |
| `SettingsStyles.swift` | 共享样式：`SettingsTab`、`SettingsTabBar`、`SettingsSection`、`SettingsListSection`、`SettingsRow`、`SettingsRowDivider`、`SettingsFieldStyle`、`SettingsSectionSeparator` |

模型设置的具体 UI 在 [AppServices/AgentSettings/AgentSettingsView.swift](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift)（历史遗留，未来应迁回 `Sources/Settings/`），由本模块的 SettingsView 嵌入。

## 数据流

```
Coordinator.send(.openSettings)
  └─ SettingsLifecycle.openOrFocus(...)
       └─ SettingsView(settingsViewModel:, toolSettingsViewModel:, permissionRulesViewModel:, shortcutActions:, workspaceViewModel:)
            ├─ AgentSettingsView(viewModel:)        // → AgentSettingsStore.update → 写 ~/.spotAgent/settings.json
            ├─ ToolSettingsView(viewModel:)         // → AgentSettingsStore.updateToolSettings → 写 ~/.spotAgent/settings.json（同文件保留 llm / tools）
            ├─ PermissionRulesView(viewModel:)      // → 写 ~/.spotAgent/permissions.json；FilePermissionPolicy 下次 check 自动重读
            ├─ ShortcutSettingsView(actions:)       // 全局快捷键 / Action 快捷键两栏；均用 KeyboardShortcuts.Recorder 写 UserDefaults
            └─ WorkspaceSettingsView(viewModel:)    // → 写 ~/.spotAgent/workspaces.json；FileWorkspaceRegistry 下次访问自动重读
  └─ 生产 presenter 通过 WindowCloseObservation 持有关闭通知 token，收到 NSWindow.willCloseNotification 后释放 token → Coordinator.send(.settingsWindowClosed)
```

`~/.spotAgent/workspaces.json` 是 desktop（写）与 agent-server（读）共享的注册表文件；`FileWorkspaceRegistry` 每次访问前按文件状态戳自动重读，无需重启 agent-server。
`~/.spotAgent/settings.json` 现在同时保存 `llm` 与 `tools` 两个顶层字段：`AgentSettingsStore` 通过单一 `update(_:)` / `updateToolSettings(_:)` 入口原子写入，避免模型配置与工具 allowlist / denylist 互相覆盖。
`~/.spotAgent/permissions.json` 由 agent-server 的 `FilePermissionPolicy` 写入永久规则；Settings 只做列表查看和撤销，撤销后 policy 会在下一次 `check / listPersistedRules / revoke / remember(always)` 前按文件戳自动重读。

## 编辑此目录的约束

- **ViewModel 是 Store 的代理层**：不缓存值；getter 透传 `store.settings.xxx` / `store.toolSettings.xxx`，setter 调 `store.update` / `store.updateToolSettings`。新增字段顺序：`AgentSettings` / `AgentToolSettings` → `AgentSettingsStore.update` / `updateToolSettings` 已支持 → ViewModel 加属性 → 对应 View 加 UI。
- **写入时统一 trim**：所有字符串字段在 setter 里 `trimmingCharacters(in: .whitespacesAndNewlines)`，避免空白污染 settings.json。
- **不要把 store 直接传给 View**：始终经过 ViewModel；测试也是 `AgentSettingsViewModel(store:)`。
- **Tab 增加规则**：新建 Tab 先在 `SettingsTab` enum 增 case、标题和图标，再在 `SettingsView.tabContent` 接入内容；Tab 内如果有副作用则配套加 ViewModel；纯展示可直接写 View。
- **视觉风格**：设置页面使用 `settingsCard()` 卡片容器 + `SettingsFieldStyle` 输入框 + `SettingsRow` 行布局，与 PromptPanel / SessionWindow 保持统一暗色玻璃风格。不要使用系统 `Form` / `GroupBox` / `.grouped` 样式。窗口标题栏设为透明 + fullSizeContentView，与 SessionWindow 一致。
- **不要在 Settings 里读 LLM/tool 运行态**：宿主层不组装 LLM 消息，`api`/`baseURL`/`apiKey` 和工具开关只是写入 settings.json；agent-server 侧每次模型请求自己读模型配置，每轮 user message 前刷新 tool registry。
- **快捷键只有两类模型**：固定系统入口全局快捷键仅包含“唤起面板 / 捕获文本选区 / 圈选区域截图”；其余可选择项统一归为 Action 快捷键，由 `ActionDefinition.shortcutName` 生成 `KeyboardShortcuts.Name("action.<id>")` 并注册为系统级全局快捷键。不要再新增 PromptPanel 局部快捷键模型。
- **测试**：[AgentSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/AgentSettingsViewModelTests.swift) 用临时 home 目录验证读写串通；[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/AgentSettings/AgentSettingsStoreTests.swift) 覆盖磁盘 IO + 轮询；[PermissionRulesViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/PermissionRulesViewModelTests.swift) 覆盖权限规则读取、参数摘要和撤销写回。

## 与其他模块的关系

- Store 在 [AppServices/AgentSettings](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)，由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有。
- 快捷键名来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 与 [PromptPanel/ActionDefinition](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)。
- 设置窗口的开/关会触发 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 中的激活策略切换。
