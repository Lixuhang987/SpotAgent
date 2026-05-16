# Coordinator 模块

`AppCoordinator` 是宿主层的单向事件流总线，全局只有一份，由 `HandAgentApp` 持有。所有模块间协调（PromptPanel ↔ SessionWindow ↔ StatusBubble ↔ Settings ↔ AgentServer）走 `send(.action)` 一条通路。

## 文件

| 文件 | 职责 |
|------|------|
| `AppCoordinator.swift` | 单向事件流、全局状态聚合、所有窗口/控制器的生命周期 |

## 事件流约束

- **唯一入口是 `send(_ action: Action)`**：所有模块向 Coordinator 报告意图都必须通过该入口，禁止直接调用 Coordinator 的 private 方法。
- **Action 是封闭枚举**：新增协调事件必须在 `Action` 枚举中显式声明分支，不要用 `Notification` / `NotificationCenter` 绕开。
- **回调走 closure 注入**：子模块（ViewModel / Controller）的回调统一在 `bootstrap()` 阶段由 Coordinator 注入闭包，闭包内只允许 `send(.xxx)`，不允许写跨模块状态。
- **状态私有化**：`sessionViewModels`、`sessionWindows`、`settingsWindow` 等对外只读，外部不能直接增删，全部由 `handleXxx` 私有方法管理。
- **测试模式 `skipServerStart`**：仅 `AppCoordinatorTests` 使用；非测试态 `init` 自动 `bootstrap()`，测试态跳过窗口/进程/激活策略副作用。

## 当前 Action 列表

```
showPromptPanel / hidePromptPanel / togglePromptPanel
submitPrompt(String, attachments: [PromptAttachmentResult])
submitAction(PromptAction)
openSettings / settingsWindowClosed
sessionClosed(String)
statusBubbleTapped(String?)
```

## 与其他模块的关系

- 持有 `PromptPanelController`、`StatusBubbleController`，通过它们驱动 `NSPanel` / `NSWindow`。
- 持有 `AgentServerService`、`SessionRegistry`、`AgentSettingsStore`（来自 AppServices 层）。
- 通过 `makeSettingsViewModel()` / `makeShortcutActions()` 暴露给 SwiftUI Scene 用于构造 Settings 窗口。
- 通过 `setActivationPolicy` 注入与 `AppActivationPolicyCoordinator` 协作切换 `.regular` / `.accessory`。

## 编辑此目录的约束

- 新增跨模块行为优先扩 `Action` 枚举，不要给 Coordinator 加 public 状态字段。
- 子模块新建窗口或 NSPanel 由 Coordinator 统一持有；子 Controller 自己管理就放在子模块下，并在 Coordinator 里只做 lazy 初始化与回调串联。
- 不要把 `LLMClient` / runtime / tool 调用塞进 Coordinator —— 这些归属 agent-server 与 packages/core。
