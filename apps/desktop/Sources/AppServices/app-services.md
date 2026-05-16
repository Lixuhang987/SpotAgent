# AppServices 层

跨模块共享的应用服务：进程管理、设置存储、会话注册、热键名、激活策略。所有服务都由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并通过依赖注入传给上层模块，自身不感知 UI 与窗口。

## 子模块

| 目录 | 文档 | 职责 |
|------|------|------|
| `AgentServer/` | [agent-server.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) | 启动、停止 node 子进程；记录启动错误 |
| `AgentSettings/` | [agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md) | `~/.spotAgent/settings.json` 读写 + 500ms 轮询；模型配置 UI |
| `Hotkey/` | [hotkey.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) | 全局快捷键名定义；PromptAction 快捷键命名规则 |
| `Lifecycle/` | [lifecycle.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) | 根据 SessionWindow / SettingsWindow 计数切换激活策略 |
| `Session/` | [session.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md) | 会话摘要注册表；驱动 StatusBubble |

## 文件

| 文件 | 职责 |
|------|------|
| `AppServices.swift` | 历史聚合容器（仅持有 `agentServerService` 与 `sessionRegistry`），新代码已由 Coordinator 直接持有各服务，本类等待清理 |

## 编辑此层的约束

- **服务是 plain 类，UI 无关**：禁止在此层 `import SwiftUI`（`AgentSettingsView.swift` 是历史遗留例外，新代码不要重蹈）。
- **`@Observable` 优先**：`SessionRegistry` / `AgentSettingsStore` 已迁到 `@Observable`；新建状态类不要再用 `ObservableObject` / `@Published` / Combine。
- **依赖通过 init 注入**：`AgentSettingsStore(homeDirectoryURL:)` 这样允许测试注入临时目录；不要在服务内直接读 `FileManager.default.homeDirectoryForCurrentUser` 之外的全局状态。
- **Main actor 隔离**：UI 相关的 `@Observable` class（`SessionRegistry` / `AgentSettingsStore`）标 `@MainActor`，进程 / IO 类（`AgentServerService`）保持非 MainActor。
- **错误对外暴露规则**：服务内部捕获错误后写 `xxxErrorMessage` 字段供 UI 读，不要直接 `fatalError` 或抛到 Coordinator。
