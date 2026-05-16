# SessionWindow 模块

会话窗口：显示一次 LLM/tool 循环的消息流，支持继续追问。架构是 **View + ViewModel + WebSocket Client + Styles** 四件套，窗口本身由 Coordinator 用 `NSWindow + NSHostingController` 直接管理（无独立 Controller 类）。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionWindowView.swift` | 纯 UI：状态条 + 消息列表 + 错误 banner + 输入框，全部消费 Theme token |
| `SessionViewModel.swift` | `@Observable` 状态：`messages` / `status` / `error`；消费 `SessionEvent` 维护气泡列表 |
| `SessionSocketClient.swift` | `URLSessionWebSocketTask` 包装：连接、收发 `SessionMessage`、解析 `SessionEvent` |
| `SessionStyles.swift` | `MessageBubbleModifier`（按 role 切换 user / assistant / tool 三色） |

## 数据流

```
Coordinator.handleSubmitPrompt
  └─ 创建 SessionViewModel(sessionID, socketClient)
  └─ 创建 NSWindow + NSHostingController(rootView: SessionWindowView(viewModel:))
  └─ 监听 NSWindow.willCloseNotification → Coordinator.send(.sessionClosed(id))
  └─ ViewModel.start(initialPrompt:, startupError:)
       └─ 若 startupError 非空：直接派发 .error 事件并返回
       └─ socketClient.connect(sessionID:) → onEvent → ViewModel.handle(_:)
       └─ socketClient.sendUserMessage(...)
agent-server 流式回包 → SessionEvent → ViewModel.handle(_:) → messages/status/error 更新 → SwiftUI 自动刷新
```

## SessionEvent 处理规则

- `userMessage / assistantMessageStart` → 追加新气泡，`status = "running"`，清空 `error`
- `assistantMessageDelta` → 找到对应 `messageID` 气泡追加文本（无匹配则丢弃，避免乱序写入）
- `assistantMessageEnd(status: "completed")` → `status = "idle"`；其他 status 透传
- `toolMessage` → 追加 role 为 `tool` 的气泡，文本格式 `"\(name): \(text)"`
- `status` → 直接覆盖；非 `failed` 时清错误
- `error` → `status = "failed"`，记录 `error`；若上一条 assistant 文本与错误重复则去重
- `sessionSnapshot` → 全量替换 messages + status

## 编辑此目录的约束

- **View 只读 ViewModel + 本地 `@State` draft**：不要直接调 socketClient；继续追问通过 `viewModel.sendPrompt(text)`。
- **ViewModel 是 main-actor、不直接做网络 I/O**：socketClient 在内部做 `URLSession` 调用，事件回调通过 `Task { @MainActor in ... }` 进入 ViewModel.handle。
- **不要在 ViewModel 里 dispatch 系统通知或调 Controller**：会话关闭由 NSWindow 通知触发 Coordinator，ViewModel 只对 `stop()` 做 socket 断开。
- **不要在前端做 LLM/tool 编排**：宿主只消费 `SessionEvent`；新事件类型必须先在 agent-server 与前端 `SessionEvent` enum 同步定义，再加 case 到 `handle(_:)`。
- **窗口尺寸 / 持久化**：当前每次 prompt 提交都新开 760×560 居中窗口，不做位置记忆；新增此能力需走 Coordinator，不要让 View 直接写 `UserDefaults`。
- **窗口与拖动区域**：Coordinator 创建 `NSWindow` 时启用 `fullSizeContentView` + `titlebarAppearsTransparent` + `titleVisibility = .hidden`，让标题栏保留默认 traffic light 与拖动手势，但视觉颜色与 SwiftUI 内容（`statusHeader` 区域）连成一片，不再出现单独颜色的标题栏条。`SessionWindowView` 的首行 `statusHeader` 直接落在标题栏下方，`Spacer()` 留出的右侧区域天然成为拖动手柄；如需在 statusHeader 增加交互控件，要给左右两端留出可拖动的空隙。
- **测试**：[SessionViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionViewModelTests.swift) 覆盖事件序列下的 messages/status 推导。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 创建窗口、ViewModel 与 socketClient，并向 [Session 注册表](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md) 写 `SessionSummary`。
- 通过 `ws://127.0.0.1:4317/api/session` 连接 [AgentServer](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)。
- 关闭窗口触发 `setActivationPolicy` 切换（由 [Lifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) 协调）。
