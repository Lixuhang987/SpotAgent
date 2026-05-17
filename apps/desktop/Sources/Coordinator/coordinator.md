# Coordinator 模块

`AppCoordinator` 是宿主层的单向事件流总线，全局只有一份，由 `HandAgentApp` 持有。所有模块间协调（PromptPanel ↔ SessionWindow ↔ StatusBubble ↔ Settings ↔ AgentServer）走 `send(.action)` 一条通路。

## 文件

| 文件 | 职责 |
|------|------|
| `AppCoordinator.swift` | 单向事件流、全局状态聚合、Action 路由；不直接构造 `NSWindow` / `NSAlert` |
| `PromptSubmission.swift` | 把 PromptPanel attachment 翻译为 `composed prompt + summary + UserMessageAttachmentPayload[]` 的纯函数 |
| `PromptCaptureCoordinator.swift` | 把热键 → 选区 / 区域采集 → PromptPanel attachment 的串联从 Coordinator 抽出 |

## 事件流约束

- **唯一入口是 `send(_ action: Action)`**：所有模块向 Coordinator 报告意图都必须通过该入口，禁止直接调用 Coordinator 的 private 方法。
- **Action 是封闭枚举**：新增协调事件必须在 `Action` 枚举中显式声明分支，不要用 `Notification` / `NotificationCenter` 绕开。
- **回调走 closure 注入**：子模块（ViewModel / Controller）的回调统一在 `bootstrap()` 阶段由 Coordinator 注入闭包，闭包内只允许 `send(.xxx)`，不允许写跨模块状态。
- **状态私有化**：`sessionViewModels`、`sessionWindows`、`settingsWindow` 等对外只读，外部不能直接增删，全部由 `handleXxx` 私有方法管理。
- **测试模式走 DI**：`AppServices.testing()` 注入 nop 替身（`NopAgentServerService` / `NopSessionWindowPresenter` / `NopSettingsWindowPresenter` / `NopHotkeyRegistrar` / `NopFatalAlertPresenter`），生产路径不再保留 `skipServerStart` 布尔旁路。
- **窗口 / Alert 构造交给 presenter**：`SessionWindowPresenting` / `SettingsWindowPresenting` / `FatalAlertPresenting` 协议在 [AppServices](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/app-services.md) 层统一暴露，Coordinator 不再 `import AppKit` 构造 `NSWindow` / `NSHostingController` / `NSAlert`。
- **agent-server 健康状态独立**：`AgentServerHealth` 持有 `errorMessage` + start/stop + fatal alert 触发，Coordinator 仅暴露 `agentServerError` 转发字段。

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
