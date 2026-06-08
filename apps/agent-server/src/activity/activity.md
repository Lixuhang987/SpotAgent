# activity

`activity/` 负责把完整 thread 通知和待回执请求派生为轻量 `/api/activity` stream，供 Electron StatusBubble 和后续桌宠订阅。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentActivityPublisher.ts` | 维护当前 activity snapshot，接收 `ThreadNotification` / `ServerRequest`，向 activity subscribers 广播 `AgentActivityEvent` |

## 边界

- 不处理 WebSocket；socket 绑定在 `server/server.ts`。
- 不发送 `ThreadCommand`，不消费 `ClientResponse`。
- 对外只发送 `AgentActivityEvent`：subscriber 连接后立即收到 `activity.snapshot`，后续状态变化收到 `activity.changed`。
- activity 状态只从 `ThreadNotification` / `ServerRequest` 派生；它不回写 thread 状态，也不影响 `/api/thread` 的通知分发。
- 不暴露完整消息内容；`latestSummary` 只使用短状态文案或最多 80 字的用户主动输入预览。
- 不替代 ThreadWindow 的 `/api/thread`。ThreadWindow 继续消费完整 thread 协议，StatusBubble 和桌宠消费 `/api/activity`。
- 向单个 subscriber 发送失败会被捕获，只隔离该 subscriber；其他 subscriber 和 `/api/thread` 不受影响。

## 状态派生

- `thread.started` / `user.message.recorded` 派生 `starting`，用于展示首轮用户输入预览。
- `turn.started` / `assistant.delta` 派生 `running`，不透出完整 assistant 内容。
- `tool.started` 派生 `tool_running`，`latestSummary` 只包含工具名短文案。
- `permission.requested` / `workspace.requested` 派生 `waiting`，并设置 `waitingRequest`。
- `turn.completed` / `thread.status.changed` 派生 `completed`、`idle` 或 `error`；`tool.finished`、`thread.snapshot`、`thread.listed`、`thread.deleted`、`workspace.listed` 不改变 activity。
- `thread.error` 可以没有 threadId；这种情况下 `activeThreadId` 为 `null`。

## 修改约束

- 新增 activity status 或 waiting request 时，先更新 `packages/core/src/protocol/AgentActivity.ts`，再更新 Electron ActivityWindow parser/display。
- 不把完整 message content、tool result 或 request payload 放进 `latestSummary`；summary 需要保持短文本，当前最多 80 字。
- 改派生规则时同步更新 `apps/agent-server/tests/activity/AgentActivityPublisher.test.ts` 和 Electron `tests/activity-window/*`。
