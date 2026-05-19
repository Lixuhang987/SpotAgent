# SessionWindow 模块

会话窗口：显示一次 LLM/tool 循环的消息流，支持继续追问、历史侧栏恢复会话、权限审批气泡和 workspace 选择气泡。模块内还提供独立历史窗口，用于搜索、预览、恢复和删除持久化会话。架构是 **View + ViewModel + WebSocket Client + Styles** 四件套，窗口本身由 AppServices 的 presenter 生产实现创建。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionWindowView.swift` | 纯 UI：历史侧栏、状态条、连接状态 banner、消息列表、用户附件摘要、错误 banner、权限审批气泡、workspace 选择气泡、输入框，全部消费 Theme token |
| `SessionViewModel.swift` | `@Observable` 状态：`messages` / `status` / `error` / `pendingPermissionRequests` / `pendingWorkspaceAskRequests` / `historyList` / `pendingHistoryDeletionID` / `connectionState`；消费 `SessionEvent` 维护 UI 状态与连接提示；`SessionBubble` 同时保存消息文本与附件展示摘要 |
| `SessionSocketClient.swift` | `URLSessionWebSocketTask` 包装：连接、收发 `SessionMessage`、解析 `SessionEvent`，并发送历史读写、权限响应帧、workspace 选择响应帧；断线后自动重连并重发 `open_session` |
| `SessionHistoryViewModel.swift` | 独立历史窗口状态：从 `SessionHistoryStore` 刷新本地历史、按 query 过滤、维护选中预览、恢复回调和删除确认状态 |
| `SessionHistoryWindowView.swift` | 独立历史窗口 UI：左侧搜索列表、右侧消息预览、恢复按钮、删除二次确认 |
| `SessionStyles.swift` | `MessageBubbleModifier`（按 role 切换 user / assistant / tool 三色） |

## 数据流

```
Coordinator.handleSubmitPrompt
  └─ 创建 SessionViewModel(sessionID, socketClient)
  └─ services.sessionWindowPresenter.present(...)
       └─ 创建 NSWindow + NSHostingController(rootView: SessionWindowView(viewModel:))
       └─ WindowCloseObservation 持有关闭通知 token，收到 NSWindow.willCloseNotification 后释放 token → Coordinator.send(.sessionClosed(id))
  └─ ViewModel.start(initialPrompt:, startupError:)
       └─ 若 startupError 非空：直接派发 .error 事件并返回
       └─ socketClient.connect(sessionID:) → onEvent → ViewModel.handle(_:)
           └─ connect / reconnect 时发送 open_session，server 回 session_snapshot 恢复历史
       └─ 本地追加 user bubble（含 `text_selection` / `image` 附件摘要）
       └─ socketClient.sendUserMessage(...)
agent-server 流式回包 → SessionEvent → ViewModel.handle(_:) → messages/status/error 更新 → SwiftUI 自动刷新
                                            └─ 状态 / 消息变化回调给 SessionLifecycle，同步 SessionRegistry 供状态气泡派生

PromptPanel 最近会话 / HistoryWindow 恢复
  └─ Coordinator.send(.restoreSession(id))
     └─ SessionLifecycle.restore(sessionID:)
        └─ 已打开同 id 窗口：focus
        └─ 未打开：用同一个 sessionId 创建 SessionViewModel + SessionWindow
           └─ socketClient.connect(sessionID:) → open_session → session_snapshot 恢复消息
```

## SessionEvent 处理规则

- `userMessage / assistantMessageStart` → 追加新气泡，`status = "running"`，清空 `error`；本地 `sendPrompt` 追加 user bubble 时会把附件转成 `SessionAttachmentSummary`
- `assistantMessageDelta` → 找到对应 `messageID` 气泡追加文本（无匹配则丢弃，避免乱序写入）
- `assistantMessageEnd(status: "completed")` → `status = "idle"`；其他 status 透传
- `toolMessage` → 追加 role 为 `tool` 的气泡，文本格式 `"\(name): \(text)"`
- `status` → 直接覆盖；非 `failed` 时清错误
- `error` → `status = "failed"`，记录 `error`；若上一条 assistant 文本与错误重复则去重
- `sessionSnapshot` → 全量替换 messages + status；对历史 user message 解析 `[选区]` 与 image `STUB`，归一为附件摘要后展示
- `permissionRequest` → 追加到 `pendingPermissionRequests`；用户点击拒绝 / 仅本次 / 本会话 / 始终允许后发送 `permission_response` 并移除气泡
- `workspaceAskRequest` → 追加到 `pendingWorkspaceAskRequests`；UI 只展示队首 ask，用户选择候选 workspace 或取消后发送 `workspace_ask_response` 并移除队首，实现同一 session 内串行展示
- `sessionList` → 刷新左侧历史侧栏列表
- `sessionLoaded` → 用历史消息替换当前消息列表，`status = "idle"`；附件摘要归一化规则同 `sessionSnapshot`
- `connectionState` → 维护 `connectionMessage`；`connecting / reconnecting / disconnected` 显示顶部连接 banner，`connected` 清除 banner。

## 历史入口

- SessionWindow 左侧历史侧栏仍复用 agent-server 的 `list/load/delete` 协议，适合在已有会话窗口内快速查看历史列表。
- 侧栏删除不再直接执行；右键「删除」只设置 `pendingHistoryDeletionID`，SwiftUI alert 二次确认后才发送 `delete_session_request` 并从本地列表移除。
- 独立 HistoryWindow 不依赖当前会话 socket，而是通过 `SessionHistoryStore` 直接读取 `~/.spotAgent/sessions/*.json`。它支持标题 / sessionId / preview 搜索，右侧展示前几条消息预览，恢复时交给 Coordinator 打开或聚焦目标 session。
- 多窗口恢复同一 session 的规则：如果目标 sessionId 已有打开窗口，只聚焦该窗口；否则新建一个窗口并等待 `open_session` 快照恢复，不发送空 prompt 之外的用户消息。

## 断线重连

- `SessionSocketClient.connect(sessionID:)` 首次连接后发送 `open_session`；若 server 中已有该 session，agent-server 会返回 `session_snapshot`。
- `receive` 失败且不是用户主动 `disconnect()` 时，客户端进入 `reconnecting`，2 秒后新建 socket 并再次发送 `open_session`，用于 server 重启后的自动续联。
- `disconnect()` 来自窗口关闭 / 会话结束，会取消待重连任务并发送 `disconnected` 状态，不再自动新建 socket。
- `SessionSocketClientTests` 用可注入 transport 验证：断线会新建 socket 并重发 `open_session`；主动 disconnect 后不会重连。

## 用户附件展示

- 当前会话本地回显：`SessionViewModel.sendPrompt(_:attachments:)` 在发送 socket 前立即追加 user bubble，并把 `UserMessageAttachmentPayload` 归一为 `SessionAttachmentSummary`。
- 历史会话恢复：server 持久化后的 user content 只保留拼接文本，`SessionBubble.normalizedForDisplay()` 会识别 `[选区]` 文本块与 `kind=image` 的 `STUB`，展示同样的附件计数与类型列表。
- UI 显示规则：user bubble 保留原始 prompt 文本，下方显示 `附件 ×N · text_selection / image` 汇总，并逐项显示文本选区预览或图片占位信息；不把图片 base64 展开进气泡。

## 编辑此目录的约束

- **View 只读 ViewModel + 本地 `@State` draft**：不要直接调 socketClient；继续追问通过 `viewModel.sendPrompt(text)`。
- **ViewModel 是 main-actor、不直接做网络 I/O**：socketClient 在内部做 `URLSession` 调用，事件回调通过 `Task { @MainActor in ... }` 进入 ViewModel.handle。
- **不要在 ViewModel 里 dispatch 系统通知或调 Controller**：会话关闭由 window presenter 的 close 回调触发 Coordinator，ViewModel 只对 `stop()` 做 socket 断开。
- **不要在前端做 LLM/tool 编排**：宿主只消费 `SessionEvent`；新事件类型必须先在 agent-server 与前端 `SessionEvent` enum 同步定义，再加 case 到 `handle(_:)`。
- **窗口尺寸 / 持久化**：当前每次 prompt 提交都新开 760×560 居中窗口，不做位置记忆；新增此能力需走 Coordinator，不要让 View 直接写 `UserDefaults`。
- **历史删除必须确认**：任何 UI 入口删除持久化会话前都先进入待确认状态，确认后再调用 `delete_session_request` 或 `SessionHistoryStore.delete`。
- **窗口与拖动区域**：Coordinator 创建 `NSWindow` 时启用 `fullSizeContentView` + `titlebarAppearsTransparent` + `titleVisibility = .hidden`，让标题栏保留默认 traffic light 与拖动手势，但视觉颜色与 SwiftUI 内容（`statusHeader` 区域）连成一片，不再出现单独颜色的标题栏条。`SessionWindowView` 的首行 `statusHeader` 直接落在标题栏下方，`Spacer()` 留出的右侧区域天然成为拖动手柄；如需在 statusHeader 增加交互控件，要给左右两端留出可拖动的空隙。
- **测试**：[SessionViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionViewModelTests.swift) 覆盖事件序列下的 messages/status/connectionState 推导，以及 workspace ask 队列移除；[SessionSocketClientTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionSocketClientTests.swift) 覆盖 reconnect + `open_session` 续联和 workspace ask 解码。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 创建窗口、ViewModel 与 socketClient；`SessionLifecycle` 接收 ViewModel 状态变化回调并向 [Session 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md) 写 `SessionSummary`。
- 通过 `ws://127.0.0.1:4317/api/session` 连接 [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)。
- 关闭窗口触发 `setActivationPolicy` 切换（由 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 协调）。
