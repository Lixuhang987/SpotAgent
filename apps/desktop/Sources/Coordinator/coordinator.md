# Coordinator 模块

`AppCoordinator` 是宿主层的单向事件流总线，全局只有一份，由 `HandAgentApp` 持有。所有模块间协调（PromptPanel ↔ ThreadWindow ↔ StatusBubble ↔ Settings ↔ AppServer）走 `send(.action)` 一条通路。

## 文件

| 文件 | 职责 |
|------|------|
| `AppCoordinator.swift` | 单向事件流、Action 路由；不持有 `NSWindow`、不 `import AppKit` |
| `AppFeature.swift` | TCA reducer：维护 agent-server 可用性、thread 连接状态与打开的 ThreadWindow 计数 |
| `ThreadWindowManaging.swift` | Coordinator 使用的 ThreadWindow 抽象，默认实现是 WKWebView lifecycle，Electron flag 路径实现是 Electron command lifecycle |
| `ThreadWindowLifecycle.swift` | 持有全局唯一 ThreadWindow；提供 `createTabWithInitialPrompt / openOrFocusHistory / focus / close`，负责 `NSWindow/WKWebView` 生命周期与 initial prompt 入队 |
| `ElectronThreadWindowLifecycle.swift` | 通过 `ThreadWindowCommanding` 向 Electron main 发送 open/focus command，不持有 Swift window 或 thread UI 状态 |
| `SettingsLifecycle.swift` | 持有设置窗口；提供 `openOrFocus / handleClosed / close` |
| `PromptSubmission.swift` | 把 PromptPanel attachment 翻译为 `composed prompt + summary + UserMessageAttachmentPayload[]` 的纯函数 |
| `PromptCaptureCoordinator.swift` | 把热键 → 选区 / 区域采集 → PromptPanel attachment 的串联从 Coordinator 抽出 |

## 事件流约束

- 唯一入口是 `send(_ action: Action)`；所有模块向 Coordinator 报告意图都必须通过该入口。
- Action 是封闭枚举；新增协调事件必须显式声明分支，不要用 `NotificationCenter` 绕开。
- 子模块回调统一在 `bootstrap()` 阶段注入闭包，闭包内只允许 `send(.xxx)`。
- 测试模式走 `AppServices.testing()` 注入 nop 替身，跳过窗口/进程/激活策略副作用。
- 窗口生命周期由 lifecycle 控制器闭环：默认路径由 `ThreadWindowLifecycle` 管全局 WKWebView ThreadWindow，Electron flag 路径由 `ElectronThreadWindowLifecycle` 通过 `ThreadWindowCommanding` 管 Electron ThreadWindow，`SettingsLifecycle` 管 Settings；Coordinator 不持有 AppKit 对象。
- 历史入口语义：`openHistory` 聚焦全局 ThreadWindow 并刷新左侧历史，不打开独立窗口，不改变 active tab；Electron flag 路径发送 `thread_window.open_history` 给 Electron main。
- PromptPanel show/toggle 只负责显示原生输入面板和刷新 action 定义，不触发 ThreadWindow prepare。Electron flag 路径的 ThreadWindow 预热由 Electron main 在 agent-server ready 后主动完成。
- PromptPanel 提交语义：默认路径复用全局 Swift WKWebView ThreadWindow；Electron flag 路径发送 `thread_window.open_initial_prompt` 给 Electron main。两条路径都只传 initial prompt payload，React 收到后通过 `/api/thread` 发送 `thread.start`，再在 `thread.started` 后发送首轮 `input.submit` 和 attachments。ThreadWindow 底部 composer 在已有 active tab 中继续提交 `input.submit`；运行中提交会进入 active turn 的输入队列。
- Action prompt 由 PromptPanel 先渲染 template。skill action 只携带渲染后的 prompt 创建新 thread；plugin action 额外携带 `{ pluginId, promptName }` 作为 `actionBinding` 创建新 thread。
- Settings 打开时会创建模型、builtin tool、Plugin、Append Prompt、MCP、权限和 workspace 的 ViewModel。Coordinator 只负责注入，不直接读写 `~/.spotAgent/plugins` 或 `~/.spotAgent/mcp.json`。
- agent-server 健康状态独立：server 不可用时拒绝 `submitPrompt` 并保留面板草稿。
- 默认路径的 Swift StatusBubble 只从 `ThreadRegistry` 派生展示；React ThreadWindow / agent-server 的实时 thread 摘要没有接入该注册表。
- Electron flag 路径下，`AppCoordinator` 在 app-server available 后调用 `ActivityWindowCommanding.showActivityWindow()`；show 失败时回退显示 Swift StatusBubble。Electron StatusBubble 点击无法聚焦 ThreadWindow 时，Coordinator 只打开 PromptPanel，不解析 `/api/activity` 状态。

## 当前 Action 列表

```
showPromptPanel / hidePromptPanel / togglePromptPanel
submitPrompt(String, attachments: [PromptAttachmentResult])
submitActionPrompt(String, actionBinding: ActionBindingPayload, attachments: [PromptAttachmentResult])
openSettings / settingsWindowClosed
openHistory / threadWindowClosed
statusBubbleTapped(String?)
```

## 与其他模块的关系

- 持有 `ThreadWindowManaging`、`SettingsLifecycle`，分别闭环 thread 窗口与设置窗口生命周期。`ThreadWindowManaging` 的生产实现由 `AppServices` 是否提供 `ThreadWindowCommanding` 决定：默认用 WKWebView lifecycle，Electron flag 路径用 Electron command lifecycle。
- 持有 `PromptPanelController`、`StatusBubbleController`，通过它们驱动 `NSPanel` / `NSWindow`。
- 持有 `AgentServerHealth`（来自 AppServices 层）。
- 通过 `AgentServerHealth.onAvailabilityChange` 驱动 [PromptPanel](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) 的提交启停状态。
- Electron flag 路径下，通过 `ActivityWindowCommanding` 显示 Electron ActivityWindow；该 command client 只承载窗口命令和 PromptPanel show 回调，不承载 activity 数据。
- `AppActivationPolicyCoordinator` 实例由 Coordinator 创建并注入 lifecycle 控制器，各自负责推送激活策略。

## 编辑此目录的约束

- 新增跨模块行为优先扩 `Action` 枚举，不要给 Coordinator 加 public 状态字段。
- 新增窗口类型 = 新增一个 lifecycle 控制器 + 1 条 Action 分支，不改 Coordinator 既有方法体。
- 子 Controller 自己管理就放在子模块下，并在 Coordinator 里只做 lazy 初始化与回调串联。
- 不要把 `LLMClient` / runtime / tool 调用塞进 Coordinator；这些归属 agent-server 与 packages/core。
