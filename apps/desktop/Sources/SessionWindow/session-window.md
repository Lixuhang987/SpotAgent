# SessionWindow 模块

会话窗口是全局唯一的会话工作区：左侧是历史对话列表，右侧是 tab 化会话区域。Window 管理历史、tabs 和 active tab；每个 tab 管理自己的 session socket、消息流、权限气泡和 workspace 选择。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionWindowView.swift` | 纯 UI：历史侧栏、tab bar、运行态 Stop 控件、连接状态 banner、消息列表、附件摘要、错误 banner、权限审批气泡、workspace 选择气泡、输入框 |
| `SessionWindowViewModel.swift` | 窗口级状态：`historyList`、`tabs`、`activeTabID`、删除确认、空态提示；负责打开/激活历史会话、创建新会话、关闭 tab |
| `SessionTabViewModel.swift` | 单 tab 状态：`sessionID`、socket、消息、运行态、连接态、权限请求、workspace ask；消费 tab 级 `SessionEvent` |
| `SessionViewModel.swift` | 旧单会话 view model 兼容层，保留消息/附件归一化类型与既有测试覆盖 |
| `SessionSocketClient.swift` | `URLSessionWebSocketTask` 包装：连接、收发 `SessionMessage`、解析 `SessionEvent`，发送 create/open/user/interrupt/list/delete/permission/workspace 响应帧；断线后自动重连 |
| `SessionStyles.swift` | `MessageBubbleModifier`（按 role 切换 user / assistant / tool 三色） |

## 数据流

```
Coordinator.handleSubmitPrompt
  └─ SessionWindowLifecycle.ensureWindow()
     └─ 创建/聚焦一个全局 SessionWindow
     └─ history socket 自动发送 list_sessions_request
     └─ SessionWindowViewModel.sendPrompt(...)
        └─ 无 active tab：history socket 发送 create_session_request
        └─ 收到 create_session_response：创建 tab 并连接 tab socket，再刷新左侧历史
        └─ 有 active tab：activeTab.sendPrompt(...) 发送 user_message

左侧历史项点击
  └─ SessionWindowViewModel.openHistorySession(id)
     └─ 已打开同 sessionId：激活已有 tab
     └─ 未打开：创建 tab，tab socket 发送 open_session，等待 session_snapshot
```

## SessionEvent 处理规则

- `createSessionResponse` 只由窗口级 view model 消费，用真实 `sessionID` 创建 tab，并刷新左侧历史列表。
- `sessionList` 只由窗口级 view model 消费，刷新左侧历史列表。
- `deleteSessionResponse` 触发历史列表刷新；删除 running session 前由 agent-server 负责 interrupt 并等待清理。
- `sessionOpenFailed / userMessageFailed` 由 tab 标记为 invalid；窗口会 prune invalid tab，并把失败原因显示为空态提示。
- `userMessage / assistantMessageStart / assistantMessageDelta / assistantMessageEnd / toolMessage / status / error / sessionSnapshot / permissionRequest / workspaceAskRequest / connectionState` 由对应 tab 消费，互不影响其他 tab。

## 历史入口

- SessionWindow 首次创建时会自动加载左侧历史列表，不依赖手动刷新入口。
- PromptPanel 的“会话历史”只聚焦全局 SessionWindow 并刷新左侧历史，不改变 active tab、running 状态或草稿。
- PromptPanel 提交 prompt 创建新会话后，收到 `create_session_response` 会自动刷新左侧历史列表。
- 点击左侧历史项会创建或激活 tab；不会再打开独立历史窗口。
- 删除历史项必须先进入待确认状态，确认后发送 `delete_session_request`；server 返回 `delete_session_response` 后刷新列表。

## 断线重连

- tab socket 连接时发送 `open_session`；若 server 中已有该 session，agent-server 返回 `session_snapshot`。
- history socket 使用空 `sessionID` 作为窗口级控制通道，用于 list/create/delete 响应；空 `sessionID` 不参与普通 tab 事件过滤。
- `receive` 失败且不是用户主动 `disconnect()` 时，客户端进入 `reconnecting`，之后新建 socket 并再次发送 `open_session`。

## 编辑此目录的约束

- View 只读 `SessionWindowViewModel` / `SessionTabViewModel` 状态，不直接调 socket。
- 新增 session 级状态优先放入 `SessionTabViewModel`；新增窗口级状态才放入 `SessionWindowViewModel`。
- 不要重新引入独立历史窗口；历史列表属于全局 SessionWindow。
- 新事件类型必须先在 agent-server 与前端 `SessionEvent` enum 同步定义，再加到对应 view model 的 `handle(_:)`。
- 历史删除必须确认；任何 UI 入口删除持久化会话前都先进入待确认状态。
- 测试：[SessionTabViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionTabViewModelTests.swift)、[SessionWindowViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift)、[SessionSocketClientTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift)。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 通过 `SessionWindowLifecycle` 创建/聚焦全局窗口，并把 tab 状态同步到 [Session 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md)。
- 通过 `ws://127.0.0.1:4317/api/session` 连接 [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)。
- 关闭窗口触发 `setActivationPolicy` 切换（由 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 协调）。
