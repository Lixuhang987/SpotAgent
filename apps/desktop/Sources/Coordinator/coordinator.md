# Coordinator 模块

`AppCoordinator` 是宿主层的单向事件流总线，全局只有一份，由 `HandAgentApp` 持有。所有模块间协调（PromptPanel ↔ SessionWindow ↔ StatusBubble ↔ Settings ↔ AgentServer）走 `send(.action)` 一条通路。

## 文件

| 文件 | 职责 |
|------|------|
| `AppCoordinator.swift` | 单向事件流、Action 路由；不持有 `NSWindow`、不 `import AppKit` |
| `SessionLifecycle.swift` | 持有 `[String: SessionViewModel]` 与会话窗口；提供 `open / restore / close / focus / closeAll` |
| `SettingsLifecycle.swift` | 持有设置窗口；提供 `openOrFocus / handleClosed / close` |
| `HistoryLifecycle.swift` | 持有独立历史窗口；提供 `openOrFocus / handleClosed / close` |
| `PromptSubmission.swift` | 把 PromptPanel attachment 翻译为 `composed prompt + summary + UserMessageAttachmentPayload[]` 的纯函数 |
| `PromptCaptureCoordinator.swift` | 把热键 → 选区 / 区域采集 → PromptPanel attachment 的串联从 Coordinator 抽出 |

## 事件流约束

- **唯一入口是 `send(_ action: Action)`**：所有模块向 Coordinator 报告意图都必须通过该入口，禁止直接调用 Coordinator 的 private 方法。
- **Action 是封闭枚举**：新增协调事件必须在 `Action` 枚举中显式声明分支，不要用 `Notification` / `NotificationCenter` 绕开。
- **回调走 closure 注入**：子模块（ViewModel / Controller）的回调统一在 `bootstrap()` 阶段由 Coordinator 注入闭包，闭包内只允许 `send(.xxx)`，不允许写跨模块状态。
- **状态私有化**：`sessionViewModels` 是计算属性（透传 `sessionLifecycle.viewModels`），外部不能直接增删。
- **测试模式走 DI**：`AppServices.testing()` 注入 nop 替身（`NopAgentServerService` / `NopSessionWindowPresenter` / `NopSettingsWindowPresenter` / `NopHotkeyRegistrar` / `NopFatalAlertPresenter`），生产路径不再保留 `skipServerStart` 布尔旁路。
- **窗口生命周期由 lifecycle 控制器闭环**：`SessionLifecycle`、`SettingsLifecycle` 和 `HistoryLifecycle` 各自持有窗口引用与 `SessionRegistry` / `AppActivationPolicyCoordinator` 写入；Coordinator 不再 `import AppKit`，不再持有 `NSWindow` / `NSHostingController` / `NSAlert`。新增窗口类型 = 新增一个 lifecycle 控制器 + 1 条 Action 分支，不改 Coordinator 既有方法体。
- **历史恢复语义**：`restoreSession(id)` 先由 `SessionLifecycle.focus(id)` 聚焦已打开窗口；未打开时用同一个 sessionId 创建 SessionWindow，只连接并等待 `open_session -> session_snapshot`，不发送新的用户 prompt，避免同一 session 多窗口状态漂移。
- **agent-server 健康状态独立**：`AgentServerHealth` 持有 `errorMessage` + start/stop + fatal alert 触发，Coordinator 暴露 `agentServerError` 转发字段，并把可用性同步给 PromptPanel；server 不可用时拒绝 `submitPrompt` 并保留面板草稿。

## 当前 Action 列表

```
showPromptPanel / hidePromptPanel / togglePromptPanel
submitPrompt(String, attachments: [PromptAttachmentResult])
submitAction(PromptAction)
openSettings / settingsWindowClosed
openHistory / historyWindowClosed
restoreSession(String)
sessionClosed(String)
statusBubbleTapped(String?)
```

## 与其他模块的关系

- 持有 `SessionLifecycle`、`SettingsLifecycle`、`HistoryLifecycle`，分别闭环会话窗口、设置窗口与独立历史窗口的生命周期。
- 持有 `PromptPanelController`、`StatusBubbleController`，通过它们驱动 `NSPanel` / `NSWindow`。
- 持有 `AgentServerHealth`（来自 AppServices 层）。
- 通过 `AgentServerHealth.onAvailabilityChange` 驱动 [PromptPanel](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) 的提交启停状态。
- 通过 `SessionHistoryStore` 为 PromptPanel 生成最近会话 action，并为 HistoryWindow 构造 `SessionHistoryViewModel`。
- 通过 `makeSettingsViewModel()` / `makeShortcutActions()` 暴露给 SwiftUI Scene 用于构造 Settings 窗口。
- `AppActivationPolicyCoordinator` 实例由 Coordinator 创建并注入两个 lifecycle 控制器，各自负责推送激活策略。

## 编辑此目录的约束

- 新增跨模块行为优先扩 `Action` 枚举，不要给 Coordinator 加 public 状态字段。
- 新增窗口类型 = 新增一个 lifecycle 控制器 + 1 条 Action 分支，不改 Coordinator 既有方法体。
- 子 Controller 自己管理就放在子模块下，并在 Coordinator 里只做 lazy 初始化与回调串联。
- 不要把 `LLMClient` / runtime / tool 调用塞进 Coordinator —— 这些归属 agent-server 与 packages/core。
