# Settings 模块

设置窗口的容器与各 Tab 视图。当前八个 Tab：模型配置（代理 `AgentSettingsStore`）、builtin 工具管理（代理 `ToolSettingsViewModel`）、Plugin 管理（代理 `PluginSettingsViewModel`）、Append Prompt 管理（代理 `AppendPromptSettingsViewModel`）、MCP 管理（代理 `MCPSettingsViewModel`）、权限规则管理（代理 `PermissionRulesViewModel`）、快捷键配置（全局快捷键 / Action 快捷键两栏，均使用 KeyboardShortcuts.Recorder）、工作区管理（代理 `WorkspaceSettingsViewModel`）。窗口本身由 Coordinator 用 `NSWindow + NSHostingController` 管理（不使用 SwiftUI `Settings` scene，因为需要主动 `openOrFocus` 控制）。

## 文件

| 文件 | 职责 |
|------|------|
| `SettingsView.swift` | 设置容器，挂"模型" / "工具" / "Plugin" / "追加" / "MCP" / "权限" / "快捷键" / "工作区"八个 Tab，统一暗色背景 |
| `AgentSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.settings` 包装成可双向绑定的属性，写时自动 trim |
| `ToolSettingsViewModel.swift` | `@Observable` 代理：把 `AgentSettingsStore.toolSettings` 包装成工具目录 + 启用/禁用切换，写时自动同步到 `settings.json` |
| `ToolSettingsView.swift` | 工具管理 UI：builtin tool 列表、风险提示、开关切换 |
| `PluginSettingsViewModel.swift` | `@Observable` 代理：读取 / 写入 `~/.spotAgent/plugins/<plugin-id>/plugin.json` 中的 plugin action manifest，支持启停、删除、新增和写入示例 |
| `PluginSettingsView.swift` | Plugin 管理 UI：plugin action 列表、启停开关、MCP server id 摘要、新增表单和示例按钮 |
| `AppendPromptSettingsViewModel.swift` | `@Observable` 代理：管理 `kind: "skill"` 的 append prompt manifest，默认写入 `~/.spotAgent/plugins/append-prompts/plugin.json` |
| `AppendPromptSettingsView.swift` | Append Prompt 管理 UI：skill prompt 列表、新增表单、删除和示例按钮 |
| `MCPSettingsViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/mcp.json` 的 stdio / streamableHttp server 列表，支持示例 server |
| `MCPSettingsView.swift` | MCP 管理 UI：server 列表、新增 stdio / HTTP 表单、删除和重启生效提示 |
| `PermissionRulesViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/permissions.json`，展示永久规则并支持按 `argHash` 撤销 |
| `PermissionRulesView.swift` | 权限规则 UI：toolName / decision / createdAt / 参数摘要列表 + 撤销按钮 |
| `ShortcutSettingsView.swift` | 快捷键配置 UI；上栏是固定系统入口“全局快捷键”，下栏是 manifest `ActionDefinition` 派生的“Action 快捷键”，两栏都用 `KeyboardShortcuts.Recorder` |
| `WorkspaceSettingsView.swift` | 工作区列表 + 添加 / 编辑 / 删除 UI；SwiftUI `fileImporter` 选目录 + 表单 sheet |
| `WorkspaceSettingsViewModel.swift` | `@Observable` 代理：直接读写 `~/.spotAgent/workspaces.json`（与 core 侧 `FileWorkspaceRegistry` 共享文件） |
| `SettingsStyles.swift` | 共享样式：`SettingsTab`、`SettingsTabBar`、`SettingsSection`、`SettingsListSection`、`SettingsRow`、`SettingsRowDivider`、`SettingsFieldStyle`、`SettingsTextEditor`、`SettingsSectionSeparator` |

模型设置的具体 UI 在 [AppServices/AgentSettings/AgentSettingsView.swift](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift)（历史遗留，未来应迁回 `Sources/Settings/`），由本模块的 SettingsView 嵌入。

## 数据流

```
Coordinator.send(.openSettings)
  └─ SettingsLifecycle.openOrFocus(...)
       └─ SettingsView(settingsViewModel:, toolSettingsViewModel:, pluginSettingsViewModel:, appendPromptSettingsViewModel:, mcpSettingsViewModel:, permissionRulesViewModel:, shortcutActions:, workspaceViewModel:)
            ├─ AgentSettingsView(viewModel:)        // → AgentSettingsStore.update → 写 ~/.spotAgent/settings.json
            ├─ ToolSettingsView(viewModel:)         // → AgentSettingsStore.updateToolSettings → 写 ~/.spotAgent/settings.json（同文件保留 llm / tools）
            ├─ PluginSettingsView(viewModel:)       // → 写 ~/.spotAgent/plugins/<plugin-id>/plugin.json（kind: plugin）
            ├─ AppendPromptSettingsView(viewModel:) // → 写 ~/.spotAgent/plugins/append-prompts/plugin.json（kind: skill）
            ├─ MCPSettingsView(viewModel:)          // → 写 ~/.spotAgent/mcp.json；重启 desktop 后 agent-server 重新读取
            ├─ PermissionRulesView(viewModel:)      // → 写 ~/.spotAgent/permissions.json；FilePermissionPolicy 下次 check 自动重读
            ├─ ShortcutSettingsView(actions:)       // 全局快捷键 / Action 快捷键两栏；均用 KeyboardShortcuts.Recorder 写 UserDefaults
            └─ WorkspaceSettingsView(viewModel:)    // → 写 ~/.spotAgent/workspaces.json；FileWorkspaceRegistry 下次访问自动重读
  └─ 生产 presenter 通过 WindowCloseObservation 持有关闭通知 token，收到 NSWindow.willCloseNotification 后释放 token → Coordinator.send(.settingsWindowClosed)
```

`~/.spotAgent/workspaces.json` 是 desktop（写）与 agent-server（读）共享的注册表文件；`FileWorkspaceRegistry` 每次访问前按文件状态戳自动重读，无需重启 agent-server。
`~/.spotAgent/settings.json` 现在同时保存 `llm` 与 `tools` 两个顶层字段：`AgentSettingsStore` 通过单一 `update(_:)` / `updateToolSettings(_:)` 入口原子写入，避免模型配置与工具 allowlist / denylist 互相覆盖。
`~/.spotAgent/plugins/<plugin-id>/plugin.json` 是 PromptPanel Action 的来源；Plugin 页面管理 `kind: "plugin"` 的 action，Append Prompt 页面管理 `kind: "skill"` 的 action。PromptPanel 下次打开或刷新 action 时会重新读取 manifest。
`~/.spotAgent/mcp.json` 是 agent-server 的 MCP server 配置；当前 agent-server 启动时读取一次，Settings 保存后需要重启桌面 App 才能进入当前 server 进程。
`~/.spotAgent/permissions.json` 由 agent-server 的 `FilePermissionPolicy` 写入永久规则；Settings 只做列表查看和撤销，撤销后 policy 会在下一次 `check / listPersistedRules / revoke / remember(always)` 前按文件戳自动重读。

## 编辑此目录的约束

- **ViewModel 是配置文件代理层**：模型和 builtin tool 通过 `AgentSettingsStore` 代理；Plugin / Append Prompt / MCP / 权限 / Workspace 直接代理各自共享 JSON 文件。新增字段时先确认对应运行端是否热加载，文档中明确是否需要重启。
- **写入时统一 trim**：所有字符串字段在 setter 里 `trimmingCharacters(in: .whitespacesAndNewlines)`，避免空白污染 settings.json。
- **不要把 store 直接传给 View**：始终经过 ViewModel；测试也是 `AgentSettingsViewModel(store:)`。
- **Tab 增加规则**：新建 Tab 先在 `SettingsTab` enum 增 case、标题和图标，再在 `SettingsView.tabContent` 接入内容；Tab 内如果有副作用则配套加 ViewModel；纯展示可直接写 View。
- **视觉风格**：设置页面使用 `settingsCard()` 卡片容器 + `SettingsFieldStyle` 输入框 + `SettingsRow` 行布局，与 PromptPanel / SessionWindow 保持统一暗色玻璃风格。不要使用系统 `Form` / `GroupBox` / `.grouped` 样式。窗口标题栏设为透明 + fullSizeContentView，与 SessionWindow 一致。
- **不要在 Settings 里读 LLM/tool 运行态**：宿主层不组装 LLM 消息，`api`/`baseURL`/`apiKey`、工具开关、plugin manifest 和 MCP server 配置都只是写入本地文件；agent-server 侧自己按既有时机读取。
- **快捷键只有两类模型**：固定系统入口全局快捷键仅包含“唤起面板 / 捕获文本选区 / 圈选区域截图”；manifest prompt 派生的 `ActionDefinition` 归为 Action 快捷键，由 `ActionDefinition.shortcutName` 生成 `KeyboardShortcuts.Name("action.<id>")` 并注册为系统级全局快捷键。不要再新增 PromptPanel 局部快捷键模型。
- **测试**：[AgentSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/AgentSettingsViewModelTests.swift) 用临时 home 目录验证读写串通；[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/AgentSettings/AgentSettingsStoreTests.swift) 覆盖磁盘 IO + 轮询；[PluginSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/PluginSettingsViewModelTests.swift)、[AppendPromptSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/AppendPromptSettingsViewModelTests.swift)、[MCPSettingsViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/MCPSettingsViewModelTests.swift) 覆盖 manifest / mcp.json 读写；[PermissionRulesViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Settings/PermissionRulesViewModelTests.swift) 覆盖权限规则读取、参数摘要和撤销写回。

## 与其他模块的关系

- Store 在 [AppServices/AgentSettings](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)，由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有。
- 快捷键名来自 [AppServices/Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) 与 [PromptPanel/ActionDefinition](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)。
- 设置窗口的开/关会触发 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 中的激活策略切换。
