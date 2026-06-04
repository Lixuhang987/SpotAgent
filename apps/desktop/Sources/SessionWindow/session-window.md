# SessionWindow 模块

会话窗口是全局唯一的会话工作区：左侧是历史对话列表，右侧是 tab 化会话区域。Window 管理历史、tabs 和 active tab；desktop 进程内主路径是进程级唯一 `AppServerConnection`，再通过 `SessionEventBus` 按 `sessionId` 把事件分发到各 tab。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionWindowView.swift` | 根布局：组合历史侧栏、右侧会话工作区与删除确认 alert；不直接写行、tab、消息或气泡细节 |
| `SessionHistorySidebarView.swift` | 左侧历史导航：按 workspace 分组展示会话（可折叠），每个 workspace 行右侧有新建按钮；搜索模式下平铺所有匹配结果 |
| `SessionWorkspaceView.swift` | 右侧工作区容器：顶部会话上下文栏、tab strip、连接 banner、空态与输入 composer |
| `SessionTabBarView.swift` | tab strip 容器、tab item、独立关闭按钮与 tab 运行/连接状态点 |
| `SessionContentView.swift` | 消息主滚动区、消息气泡、消息文本选择 / 复制入口、附件行与错误内联面板 |
| `SessionMessageClipboard.swift` | 消息级复制 helper：把单条 message 文本写入系统剪贴板 |
| `SessionRequestBubbleViews.swift` | 权限审批与 workspace 选择内联面板 |
| `SessionWindowViewModel.swift` | 窗口级状态：`historyList`、`tabs`、`activeTabID`、删除确认、空态提示；负责订阅全局事件、创建/激活/关闭 tab、刷新历史列表，并向共享连接发送窗口级 command |
| `SessionTabViewModel.swift` | 单 tab 状态：`sessionID`、消息、运行态、连接态、权限请求、workspace ask；负责按 `sessionId` 订阅事件、发送 turn 相关 command，以及回传 permission / workspace 响应 |
| `SessionRunStatus.swift` | UI 内部运行态枚举；协议边界仍接收字符串，进入 ViewModel 后归一化为 `idle / running / failed / interrupted` |
| `SessionViewModel.swift` | 旧单会话 view model 兼容层，保留消息/附件归一化类型与既有测试覆盖 |
| `SessionProtocolClient.swift` | 共享连接协议编解码：负责 command / event / request / response 与 Swift UI 模型之间的转换 |
| `LegacySessionSocketClient.swift` | 旧单 socket 客户端兼容层；保留给旧测试/兼容路径，不是当前 SessionWindow 主链路 |
| `SessionStyles.swift` | `MessageBubbleModifier`（按 role 切换 user / assistant / tool 三色） |

## 数据流

```
Coordinator.handleSubmitPrompt
  └─ SessionWindowLifecycle.ensureWindow()
     └─ 创建/聚焦一个全局 SessionWindow
     └─ 创建唯一 AppServerConnection + SessionEventBus
     └─ 共享连接建立后发送 sessions_list
     └─ SessionWindowViewModel.createTabWithInitialPrompt(...)
        └─ 共享连接发送 session_create
        └─ 收到 session_created：创建 tab 并发送 session_subscribe，再刷新左侧历史
        └─ 新 tab 通过共享连接发送 turn_start
        └─ SessionProtocolClient 解码 event / request
        └─ SessionEventBus 按 sessionId 分发到对应 tab

左侧历史项点击
  └─ SessionWindowViewModel.openHistorySession(id)
     └─ 已打开同 sessionId：激活已有 tab
     └─ 未打开：创建 tab，tab 发送 session_subscribe，等待 session_snapshot

顶部 tab 关闭
  └─ SessionCloseTabButton.onClose
     └─ SessionWorkspaceView.onCloseTab(tabID)
        └─ SessionWindowViewModel.closeTab(tabID)
           └─ tab 发送 session_unsubscribe 并取消事件订阅
           └─ onTabClosed(tab) 同步 SessionRegistry
           └─ 从 tabs 移除；若关闭 active tab，则激活剩余最后一个 tab 或进入空态
```

## 布局与交互边界

- 左侧只承担历史导航和持久化历史删除入口；历史删除仍必须走确认弹窗。
- 上方 tab strip 只管理“当前窗口中已打开的 tab”。关闭 tab 只取消该 tab 的订阅并从窗口移除，不删除本地历史文件。
- tab item 内部拆成两个明确点击目标：左侧激活按钮与右侧 `SessionCloseTabButton`。不要把 `xmark` 作为父激活按钮里的被动图标，否则点击关闭会变成激活 tab。
- 右侧顶部状态栏展示当前会话标题、运行/连接状态与已打开 tab 数；Stop 只作用于当前 active tab。
- 消息列表是工作区主滚动区域；消息正文允许文本选中，每条 message 右上角提供复制图标，复制范围固定为该条 `SessionBubble.text`。
- 错误、权限审批和 workspace 选择作为消息区底部的内联面板展示。
- 底部 composer 在无 active tab 时发送会创建新会话；有 active tab 时发送到当前 tab。
- PromptPanel 提交总是创建新会话 tab，不会把输入发到当前 active tab。

## SessionEvent 处理规则

- `session_created` 只由窗口级 view model 消费，用真实 `sessionID` 创建 tab，并刷新左侧历史列表。
- `sessions_listed` 只由窗口级 view model 消费，刷新左侧历史列表。
- `session_deleted(status: "deleted")` 触发历史列表刷新，并同步关闭同 `sessionID` 的已打开 tab；删除 running session 前由 agent-server 负责 interrupt 并等待清理。
- `session_error` 既可能是全局错误，也可能按 `sessionId` 路由到 tab。
- `user_message_recorded`、`turn_started`、`assistant_delta`、`tool_started`、`tool_finished`、`turn_completed`、`session_status_changed`、`session_snapshot`、`permission_ask`、`workspace_ask`、`connectionState` 都先经过共享连接和 `SessionProtocolClient` 解码，再由 `SessionEventBus` 分发给对应 tab，互不影响其他 tab。
- `turn_completed(status: "completed")` 与随后到达的 `session_status_changed(value: "idle")` 会在 UI 内归一化为 `SessionRunStatus.idle`；未知协议状态按 `idle` 处理，避免 UI 继续散落字符串比较。
- `tool_started`、待处理中的 `permission_ask` / `workspace_ask`，以及运行中的连接状态都可能让 tab 恢复或保持 `running`；最终状态仍由后续 `tool_finished`、`turn_completed`、`session_status_changed`、`session_error` 或 `session_snapshot` 决定。

## 历史入口

- SessionWindow 首次创建时会自动加载左侧历史列表，不依赖手动刷新入口。
- 历史入口只聚焦全局 SessionWindow 并刷新左侧历史，不改变 active tab、running 状态或草稿。
- PromptPanel 提交 prompt 创建新会话后，收到 `session_created` 会自动刷新左侧历史列表。
- 点击左侧历史项会创建或激活 tab；不会再打开独立历史窗口。
- 删除历史项必须先进入待确认状态，确认后发送 `session_delete`；server 返回成功的 `session_deleted` 后关闭对应已打开 tab 并刷新列表。

## 断线重连

- 共享连接建立后，window 会刷新一次历史列表；tab 打开或重连恢复时发送 `session_subscribe`，由 server 返回 `session_snapshot`。
- 新 tab 从 PromptPanel 首次提交时，`session_subscribe` 返回的快照可能早于或晚于本地 `turn_start` 回路到达；tab 必须保留本地已追加但尚未由后续事件确认的首轮消息，不能让快照把右侧消息列表清空。
- agent-server 重启后若 snapshot 返回 `status: "failed"`，tab 会把最后一条 assistant 文本作为错误条内容展示；这用于运行中 server 重启丢失 active run 时显示 `本轮运行因 agent-server 重启而中断，请重新发送请求。`，同时保留消息区内的 assistant 错误消息。
- `receive` 失败且不是用户主动 `disconnect()` 时，`AppServerConnection` 进入 `reconnecting`；重连成功后 window 会重新拉历史，各 tab 重新发送 `session_subscribe`。

## 编辑此目录的约束

- View 只读 `SessionWindowViewModel` / `SessionTabViewModel` 状态，不直接调连接或协议编解码。
- 新增 session 级状态优先放入 `SessionTabViewModel`；新增窗口级状态才放入 `SessionWindowViewModel`。
- 不要重新引入独立历史窗口；历史列表属于全局 SessionWindow。
- 新事件类型必须先在 agent-server 与前端 `SessionEvent` enum 同步定义，再加到对应 view model 的 `handle(_:)`。
- 历史删除必须确认；任何 UI 入口删除持久化会话前都先进入待确认状态。
- 测试：[SessionWindowViewTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionWindowViewTests.swift)、[SessionTabViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionTabViewModelTests.swift)、[SessionWindowViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift)。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 通过 `SessionWindowLifecycle` 创建/聚焦全局窗口，并把 tab 状态同步到 [Session 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md)。
- 通过 `ws://127.0.0.1:4317/api/session` 连接 [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)。
- [AgentServerConnection](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) 在进程内维持唯一共享连接；[SessionEventBus](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) 负责按 `sessionId` 分发。
- 关闭窗口触发 `setActivationPolicy` 切换（由 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 协调）。
