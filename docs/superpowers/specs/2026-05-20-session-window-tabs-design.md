# 设计：SessionWindow 单窗口多 Tab 会话历史

## 背景

当前桌面端的会话模型基本是 `sessionId` 和 `SessionWindow` 一一对应。PromptPanel 可以从最近会话 action 显式恢复会话，SessionWindow 左侧侧栏可以加载历史，独立 HistoryWindow 也可以搜索、预览、恢复和删除历史。

这个模型的问题是产品语义不一致：用户看到的是“历史会话列表”，但底层仍有“恢复某个 session 到某个 window”的概念。当前侧栏 `load_session_request` 还会把目标历史消息加载进当前 `SessionViewModel`，但 `sessionID` 仍然是原窗口的 ID，继续发送消息时容易写入错误 session。新的目标是改成主流 agent 类产品的模型：一个全局 SessionWindow 显示历史对话，点击历史对话打开或切换 tab，输入框直接发送到当前 tab。

## 目标

- 全局只有一个 SessionWindow。
- SessionWindow 左侧显式展示历史对话列表。
- 点击左侧历史对话时，在唯一窗口里创建或激活对应 tab。
- Window 拥有 tabs，tab 拥有完整对话生命周期。
- 运行中的 tab 允许在后台继续运行，切换 tab 不 interrupt。
- PromptPanel 不再展示最近会话 action。
- PromptPanel 的“会话历史”动作改为打开或聚焦唯一 SessionWindow，不改变已打开窗口的 active tab 或 tabs 状态。
- 独立 HistoryWindow 移除。
- 空态输入消息时显式创建新 session 和新 tab。
- 协议层去掉“静默失败”和“隐式创建任意 session”的语义。

## 非目标

- 不做多 SessionWindow。
- 不做 Command+点击历史项创建新窗口。
- 不做 tab 拖拽、tab 持久布局、跨窗口移动 tab。
- 不改变 LLM runtime、tool registry、permission policy 的核心抽象。
- 不为 macOS 15 以下系统设计 fallback。

## 产品行为

### PromptPanel

- 普通 prompt 提交：打开或聚焦唯一 SessionWindow，显式创建新 session 和新 tab，并把首条 prompt 发送到该 tab。
- “会话历史”动作：打开或聚焦唯一 SessionWindow，刷新左侧历史列表；如果窗口已经打开，不改变 `activeTabId`、tabs、运行态或草稿。只有窗口首次创建且还没有 tab 时，右侧自然显示空态。
- 最近会话 action 删除。PromptPanel 不再承担历史恢复入口。

### SessionWindow

- Window 只是会话工作区容器，不再代表某个 `sessionId`。
- 左侧历史列表来自持久化 session store，按 `updatedAt` 倒序展示。
- 点击历史项：
  - 如果该 `sessionId` 已经有 tab，则激活现有 tab。
  - 如果没有 tab，则创建 `SessionTabViewModel(sessionId)`，发送 `open_session`，等待明确回包。
- tab 栏显示当前已打开 tabs。关闭 tab 只释放该 tab 的运行态和 socket，不删除历史文件。
- `activeTabId = nil` 时右侧显示空态。用户直接发送消息会创建新 session、新 tab，并发送首条消息。
- inactive running tab 继续接收 socket 事件。左侧历史项和 tab 上显示运行态标记。
- Stop 只作用于当前 active tab。后台 running tab 不会因为切换或打开历史而停止。

### 删除历史

- 删除历史仍必须二次确认。
- 删除动作只表达“删除持久化 session”，不要求客户端先关闭 tab。
- 如果目标 session 正在 running，server 串行执行 interrupt 和 delete。
- 删除成功后客户端刷新历史列表。
- 已打开 tab 如果后续 `open_session`、重连或发送消息发现 session 不存在，由 tab 生命周期处理退出：
  - inactive tab 可静默关闭。
  - active tab 关闭后回到空态，并显示轻量提示“该会话已删除或不存在”。

## 架构

### 新所有权

```text
AppCoordinator
  └─ SessionWindowLifecycle
       └─ SessionWindowViewModel
            ├─ historyList
            ├─ tabs: [SessionTabViewModel]
            ├─ activeTabId: TabID?
            ├─ pendingHistoryDeletionID
            └─ commands: openHistorySession / createSession / closeTab / deleteHistory

SessionTabViewModel
  ├─ tabId
  ├─ sessionId
  ├─ messages
  ├─ status
  ├─ error
  ├─ pendingPermissionRequests
  ├─ pendingWorkspaceAskRequests
  ├─ connectionState
  ├─ socketClient
  └─ commands: open / sendPrompt / stop / reconnect / disconnect
```

### `SessionWindowViewModel`

窗口级状态，负责：

- 管理唯一窗口内的 tab 集合和 active tab。
- 管理左侧历史列表、刷新、搜索入口预留、删除确认状态。
- 处理空态发送消息，调用协议显式创建新 session。
- 把 active tab 的 messages/status/error/pending request 暴露给 View。
- 汇总 tabs 状态，供左侧历史项和 tab 栏显示 running、failed、interrupted、pending permission 等标记。

它不直接编排 LLM，不直接持有 runtime，也不直接解析 runtime 事件。

### `SessionTabViewModel`

会话级状态，承接当前 `SessionViewModel` 的大部分职责：

- 固定绑定一个已存在的 `sessionId`。
- 持有独立 `SessionSocketClient`。
- 处理 `session_snapshot`、assistant delta、tool message、permission request、workspace ask、status、error。
- `sendPrompt` 只向已存在 session 发送消息。
- `stop` 只 interrupt 当前 tab 的 session。
- `disconnect` 只释放该 tab 的 socket，不删除持久化历史。

### 生命周期

`SessionLifecycle` 需要从 `[sessionId: NSWindow]` 改为唯一 `SessionWindowLifecycle`：

- `openOrFocusHistory()`：打开或聚焦唯一窗口，刷新历史，不改变已存在窗口的 active tab 或 tabs 状态。首次创建窗口时 `activeTabId = nil`。
- `createTabWithInitialPrompt(prompt)`：打开唯一窗口，创建新 session/tab，并发送首条消息。
- `openSessionInTab(sessionId)`：打开唯一窗口，在当前窗口创建或激活 tab。
- `closeWindow()`：关闭唯一窗口时断开所有 tabs socket，更新状态气泡。

`SessionRegistry` 不再以“窗口是否打开”作为 session 的核心事实。它应改为从 tabs 汇总运行态，供 StatusBubble 判断是否有 running session。

## 协议设计

### 当前问题

现有协议语义有三处不适合 tab 架构：

- `open_session` 命中已有 session 时返回 `session_snapshot`，但 session 不存在时什么都不返回。客户端无法区分“还在加载”和“已不存在”。
- `user_message` 会对不存在的 `sessionId` 调用 `ensureSession`，导致任意带 ID 的消息都能隐式创建 session。
- `load_session_request` 和 `open_session` 在历史加载上语义重叠，且独立 HistoryWindow 移除后不应继续作为主路径。

### 新消息语义

#### `open_session`

只用于打开已有 session。

- session 存在：返回 `session_snapshot`。
- session 不存在：返回 `session_open_failed`。

```ts
{
  type: "session_open_failed";
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    reason: "not_found" | "unavailable";
    message: string;
  };
}
```

客户端状态：

- 发送 `open_session` 后 tab 进入 `loading`。
- 收到 `session_snapshot` 后进入 `idle` 或快照状态。
- 收到 `session_open_failed(reason: "not_found")` 后退出 tab。
- socket 断开仍是 `reconnecting`，不等价于 not found。

#### `create_session_request`

显式创建新 session，可选携带首条 user message。空态发送和 PromptPanel 提交都走这条协议。

```ts
{
  type: "create_session_request";
  sessionId: "";
  messageId: string;
  timestamp: string;
  payload: {
    initialText?: string;
    attachments?: UserMessageAttachment[];
  };
}
```

成功后返回：

```ts
{
  type: "create_session_response";
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    title: string | null;
  };
}
```

如果 `initialText` 非空，server 创建 session 后立即按第一条 user message 进入 runtime。客户端先创建 tab，再消费后续 assistant/tool/status 事件。

#### `user_message`

只追加到已存在 session。

- session 存在：持久化 user message 并启动 runtime。
- session 不存在：返回 `user_message_failed`，不创建 session。

```ts
{
  type: "user_message_failed";
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    reason: "session_not_found" | "invalid_request";
    message: string;
  };
}
```

#### `delete_session_request`

server 负责串行处理中断和删除。

```text
delete_session_request(targetSessionId)
  如果 target session running:
    interrupt active run
    等待 active run 结束或进入 interrupted
    删除持久化 session
  否则:
    直接删除持久化 session
  返回 delete_session_response
```

返回：

```ts
{
  type: "delete_session_response";
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    targetSessionId: string;
    status: "deleted" | "not_found";
  };
}
```

### 废弃语义

- 前端主路径不再发送 `load_session_request`。
- `load_session_response` 可暂时保留兼容测试或后续只读预览，但不参与 SessionWindow tab 生命周期。
- `user_message` 不再调用 `ensureSession` 创建缺失 session。

## 后端调整

### `SessionRouter`

- 新增 `create_session_request` 分支。
- `open_session` 缺失 session 时推送 `session_open_failed`。
- `user_message` 前校验 session 是否存在，不存在时推送 `user_message_failed`。
- `delete_session_request` 改为等待 orchestrator 串行 interrupt 后再删除，并推送 `delete_session_response`。

### `SessionRuntimeOrchestrator`

- 提供 `isSessionRunning(sessionId)`，供删除前判断状态和 UI 状态汇总使用。
- 提供 `interruptAndWait(sessionId)`，供删除 running session 时串行等待 active run settled。
- 删除 running session 时复用现有 interrupt 语义，但需要让调用方能等待 active run settled。
- `handleUserMessage` 不再负责创建 session。它只处理已存在 session 的一轮 user message。
- `create_session_request(initialText)` 可以复用内部 run 编排，但创建 session 的动作必须在 Router/Persistence 的显式创建流程里完成。

### `SessionPersistence`

- 保留 `createSession(title?)`，作为显式创建入口。
- 保留 `getSession(sessionId)` 用于校验。
- 移除或限制 `ensureSession` 在 `user_message` 主路径中的使用。

## 桌面端调整

### 移除入口

- 删除独立 `SessionHistoryWindowView`、`SessionHistoryViewModel` 和对应 lifecycle/presenter 入口。
- PromptPanel 删除最近会话 action 生成逻辑。
- PromptPanel 的“会话历史”action 改为 `openOrFocusHistory()`。

### ViewModel 拆分

- 将当前 `SessionViewModel` 拆成：
  - `SessionWindowViewModel`：窗口、历史、tabs、active tab、删除确认。
  - `SessionTabViewModel`：消息、socket、runtime 状态。
- 当前 `SessionSocketClient` 继续作为 tab 级依赖。
- `SessionEvent` 增加新 case：`sessionOpenFailed`、`createSessionResponse`、`userMessageFailed`、`deleteSessionResponse`。

### UI

- 左侧历史列表默认可见。
- 右侧顶部增加 tab 栏。
- 没有 active tab 时显示空态和输入框。
- 输入框行为：
  - active tab 存在：发送 `user_message`。
  - active tab 不存在：发送 `create_session_request(initialText)`。
- 权限审批和 workspace ask 只显示 active tab 的 pending request。
- 后台 tab 的 pending request 在 tab 或历史项上显示标记。

## 错误处理

- `session_open_failed(not_found)`：关闭对应 tab；如果是 active tab，回空态并显示轻量提示。
- `user_message_failed(session_not_found)`：关闭对应 tab；如果是 active tab，回空态并显示轻量提示。
- `delete_session_response(not_found)`：刷新历史；如果已有 tab，等待 tab 后续 open/reconnect 自行退出。
- socket reconnect 只表示连接状态，不得触发删除或关闭 tab。
- running tab 的 LLM/tool 错误仍走现有 `error`，显示为该 tab 的 assistant/error 状态。

## 测试策略

### TypeScript

- `SessionRouter.test`
  - `open_session` 缺失 session 返回 `session_open_failed`。
  - `user_message` 缺失 session 返回 `user_message_failed`，且不创建 session。
  - `create_session_request(initialText)` 创建 session 并启动 runtime。
  - `delete_session_request` 对 running session 串行 interrupt 和 delete。
  - `delete_session_request` 返回 `delete_session_response`。
- `SessionRuntimeOrchestrator.test`
  - `interruptAndWait` 能等待 active run settled。
  - 删除 running session 后旧 run 不再写入已删除 session。
- storage 测试确认显式 create 和 delete 不破坏现有持久化格式。

### Swift

- `SessionWindowViewModelTests`
  - 空态发送创建 tab。
  - 点击历史项复用已打开 tab。
  - 点击历史项创建新 tab 并进入 loading。
  - active tab 切换不影响后台 running tab 状态。
  - 删除历史不主动关闭 tab。
  - `sessionOpenFailed(not_found)` 关闭 tab并回空态。
- `SessionTabViewModelTests`
  - `session_snapshot` 填充消息。
  - `userMessageFailed(session_not_found)` 触发 tab 失效。
  - stop 只发送当前 tab interrupt。
  - permission/workspace ask 只归属当前 tab。
- `AppCoordinatorTests`
  - PromptPanel 最近会话 action 不再生成。
  - 会话历史 action 打开或聚焦唯一 SessionWindow，且不改变已打开窗口的 active tab。
  - 多次 prompt 提交复用唯一窗口并创建多个 tabs。

### 手工 QA

- 从 PromptPanel 输入 prompt，唯一 SessionWindow 打开并创建 tab。
- 从 PromptPanel 首次打开会话历史，唯一 SessionWindow 进入无 active tab 空态。
- 在已有 active tab 或 running tab 时从 PromptPanel 打开会话历史，窗口只被聚焦且历史刷新，active tab 和运行态不变。
- 点击历史项打开 tab，切换 tab 后后台 running 继续输出。
- 删除 running session，确认 server interrupt 后删除，历史刷新。
- 删除已打开但 inactive 的历史，再切回或重连时 tab 自动退出。

## 文档更新

实现时需要同步更新：

- `handAgent.md`：主调用链路和当前实现状态。
- `apps/desktop/desktop.md`：SessionWindow 和 HistoryWindow 入口说明。
- `apps/desktop/Sources/SessionWindow/session-window.md`：新 Window/Tab 架构和事件规则。
- `apps/desktop/Sources/Coordinator/coordinator.md`：唯一 SessionWindow lifecycle。
- `packages/core/src/protocol/SessionMessage.ts` 对应协议文档或注释。
- `docs/manual-qa.md`：单窗口多 tab 的手工验收清单。

## 迁移顺序建议

1. 先改协议和后端测试：补齐结构化失败回包、显式 create、删除回包。
2. 再拆桌面端 ViewModel：引入 `SessionTabViewModel`，保留现有 UI 行为的最小可运行形态。
3. 引入 `SessionWindowViewModel` 和唯一窗口 lifecycle。
4. 改 PromptPanel 入口，移除最近会话和独立 HistoryWindow。
5. 最后调整 UI：左侧历史常驻、tab 栏、空态、状态标记。

这个顺序把协议语义先固定下来，避免 UI 重构过程中继续依赖旧的“恢复”和“隐式创建”行为。
