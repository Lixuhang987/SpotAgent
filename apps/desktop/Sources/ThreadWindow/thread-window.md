# ThreadWindow 模块

ThreadWindow 是全局唯一的 thread 工作区：左侧是历史 thread 列表，右侧是 tab 化 thread 区域。Window 管理历史、tabs 和 active tab；desktop 进程内主路径通过 `AppServer` 的 thread / turn 语义接口发送命令，入站消息由 `AppServerClient` 解码后再通过 `ThreadEventBus` 按 `threadId` 分发到各 tab。

## 文件

| 文件 | 职责 |
|------|------|
| `ThreadWindowView.swift` | 根布局：组合历史侧栏、右侧 thread 工作区与删除确认 alert |
| `ThreadHistorySidebarView.swift` | 左侧历史导航：按 workspace 分组展示 thread；搜索模式下平铺匹配结果 |
| `ThreadWorkspaceView.swift` | 右侧工作区容器：tab strip、空态、消息区与输入 composer |
| `ThreadTabBarView.swift` | tab strip 容器、tab item、独立关闭按钮与 tab 状态点 |
| `ThreadContentView.swift` | 消息滚动区、消息气泡、复制入口、附件行与错误内联面板 |
| `ThreadMessageClipboard.swift` | 消息级复制 helper |
| `ThreadRequestBubbleViews.swift` | `permission.requested` 与 `workspace.requested` 的内联回执面板 |
| `ThreadState.swift` | thread 配置快照：`threadId`、运行态、失效原因等稳定状态 |
| `EventStore.swift` | thread 运行缓存：消息、连接提示、权限请求、workspace 请求、本地待确认 turn |
| `ThreadFeature.swift` | TCA thread reducer：消费本地操作与 `ThreadEvent`，更新 `ThreadState + EventStore` |
| `ThreadWindowFeature.swift` | TCA window reducer：管理 tabs、active tab、历史列表、删除确认、连接状态和启动中 prompt |
| `ThreadWindowCommands.swift` | ThreadWindow 本地语义命令 / 回执类型；Lifecycle 将其映射到 AppServer 语义方法 |
| `ThreadWindowViewModel.swift` | SwiftUI / AppKit 生命周期适配层：持有 `StoreOf<ThreadWindowFeature>`，负责订阅事件、发送窗口级 command、创建 tab adapter |
| `ThreadTabViewModel.swift` | 单 tab 适配层：持有 `StoreOf<ThreadFeature>`，负责 `turn.start` / `turn.interrupt`、回执和事件订阅 |
| `ThreadRunStatus.swift` | UI 内部运行态枚举；协议边界字符串归一化为 `idle / running / failed / interrupted` |
| `ThreadEventTypes.swift` | UI 本地事件模型 |
| `ThreadModels.swift` | 消息、附件、权限请求和 workspace 请求模型 |
| `ThreadStyles.swift` | `MessageBubbleModifier` |

## 数据流

```
Coordinator.handleSubmitPrompt
  └─ ThreadWindowLifecycle.ensureWindow()
     └─ 创建/聚焦全局 ThreadWindow
     └─ 复用 AppServer 共享连接 + ThreadEventBus
     └─ 共享连接建立后调用 AppServer.listThreads
     └─ ThreadWindowViewModel.createTabWithInitialPrompt(...)
        └─ AppServer.startThread
        └─ 收到 thread.started：创建 tab 并发送 thread.resume
        └─ 新 tab 通过 AppServer.startTurn 发送首轮 turn
        └─ AppServerClient 解码 notification / request
        └─ ThreadEventBus 按 threadId 分发到对应 tab

左侧历史项点击
  └─ ThreadWindowViewModel.openHistoryThread(id)
     └─ 已打开同 threadId：激活已有 tab
     └─ 未打开：创建 tab，tab 发送 thread.resume，等待 thread.snapshot

顶部 tab 关闭
  └─ ThreadCloseTabButton.onClose
     └─ ThreadWorkspaceView.onCloseTab(tabID)
        └─ ThreadWindowViewModel.closeTab(tabID)
           └─ tab 取消本地事件订阅
           └─ onTabClosed(tab) 同步 ThreadRegistry
           └─ 从 tabs 移除
```

## 协议边界

Desktop 发送的 command：

- `thread.start`
- `thread.resume`
- `thread.list`
- `thread.delete`
- `turn.start`
- `turn.interrupt`

Server 推送的 notification / request：

- `thread.started`
- `thread.snapshot`
- `user.message.recorded`
- `turn.started`
- `assistant.delta`
- `tool.started`
- `tool.finished`
- `turn.completed`
- `thread.status.changed`
- `thread.listed`
- `thread.deleted`
- `thread.error`
- `permission.requested`
- `workspace.requested`

Desktop 回执：

- `permission.answered`
- `workspace.answered`

协议路由字段统一为 `threadId`；notification ID 字段统一为 `notificationId`。旧下划线命令、旧 ask / answer 回执和单 socket client 协议已删除。

## 布局与交互边界

- 左侧只承担历史导航和持久化历史删除入口；历史删除必须走确认弹窗。
- 上方 tab strip 只管理当前窗口中已打开的 tab。关闭 tab 只取消本地订阅并从窗口移除，不删除本地历史。
- tab item 内部拆成两个明确点击目标：左侧激活按钮与右侧 `ThreadCloseTabButton`。
- Stop 只作用于当前 active tab，发送 `turn.interrupt`。
- 消息正文允许文本选中，每条 message 右上角提供复制图标，复制范围固定为该条 `ThreadBubble.text`。
- 错误、权限审批和 workspace 选择作为消息区底部的内联面板展示。
- 底部 composer 在无 active tab 时创建新 thread；有 active tab 时发送到当前 tab。
- PromptPanel 提交总是创建新 thread tab，不会把输入发到当前 active tab。

## ThreadEvent 处理规则

- `thread.started` 由窗口级 view model 消费，用真实 `threadID` 创建 tab，并刷新左侧历史列表。
- `thread.listed` 由窗口级 view model 消费，刷新左侧历史列表。
- `thread.deleted(status: "deleted")` 触发历史列表刷新，并同步关闭同 `threadID` 的已打开 tab。
- `thread.error` 既可能是全局错误，也可能按 `threadId` 路由到 tab。
- `user.message.recorded`、`turn.started`、`assistant.delta`、`tool.started`、`tool.finished`、`turn.completed`、`thread.status.changed`、`thread.snapshot`、`permission.requested`、`workspace.requested`、`connectionState` 都先经过共享连接和 `AppServerClient` 解码，再由 `ThreadEventBus` 分发给对应 tab。
- `turn.completed(status: "completed")` 与随后到达的 `thread.status.changed(value: "idle")` 会在 UI 内归一化为 `ThreadRunStatus.idle`。
- `tool.started`、待处理中的 `permission.requested` / `workspace.requested`，以及运行中的连接状态都可能让 tab 恢复或保持 `running`。

## Store 边界

- `ThreadFeature.State.thread` 是 thread 配置快照；`ThreadFeature.State.events` 是运行期事件缓存。
- `ThreadWindowFeature.State` 是窗口级状态源，包含历史列表、打开的 thread state、active tab、删除确认、notice 和共享连接状态。
- `ThreadWindowViewModel` / `ThreadTabViewModel` 是 SwiftUI 观察和 AppKit 生命周期适配层；它们通过 TCA `Store` 暴露派生属性，并负责不可放进 reducer 的副作用：触发 AppServer 语义命令 / 回执、订阅 `ThreadEventBus`、复制剪贴板、同步 `ThreadRegistry`。

## 断线重连

- 共享连接建立后，window 会刷新一次历史列表。
- tab 打开或重连恢复时发送 `thread.resume`，由 server 返回 `thread.snapshot`。
- 新 tab 从 PromptPanel 首次提交时，`thread.resume` 返回的快照可能早于或晚于本地 `turn.start` 回路到达；tab 必须保留本地已追加但尚未由后续事件确认的首轮消息。
- agent-server 重启后若 snapshot 返回 `status: "failed"`，tab 会把最后一条 assistant 文本作为错误条内容展示。
- `receive` 失败且不是用户主动断开时，`AppServerConnection` 进入 `reconnecting`；重连成功后 window 重新拉历史，各 tab 重新发送 `thread.resume`。

## 编辑此目录的约束

- View 只读 `ThreadWindowViewModel` / `ThreadTabViewModel` 暴露的派生状态，不直接调连接或协议编解码。
- 新增 thread 级状态优先放入 `ThreadState` 或 `EventStore`，再由 `ThreadFeature` 更新；新增窗口级状态放入 `ThreadWindowFeature.State`。
- 不要重新引入独立历史窗口；历史列表属于全局 ThreadWindow。
- 新事件类型必须先在 agent-server 与 Swift `AppServerClient` / `ThreadProtocolClient` 同步定义，再加到对应 view model 的 `handle(_:)`。
- 历史删除必须确认；任何 UI 入口删除持久化 thread 前都先进入待确认状态。
- 测试：[ThreadWindowViewTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/ThreadWindow/ThreadWindowViewTests.swift)、[ThreadTabViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/ThreadWindow/ThreadTabViewModelTests.swift)、[ThreadWindowViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/ThreadWindow/ThreadWindowViewModelTests.swift)、[ThreadProtocolClientTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/AgentServer/ThreadProtocolClientTests.swift)。
