# activity

`activity/` 负责把完整 thread 通知和待回执请求派生为轻量 `/api/activity` stream，供 Electron StatusBubble 和后续桌宠订阅。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentActivityPublisher.ts` | 维护当前 activity snapshot，接收 `ThreadNotification` / `ServerRequest`，向 activity subscribers 广播 `AgentActivityEvent` |

## 边界

- 不处理 WebSocket；socket 绑定在 `server/server.ts`。
- 不发送 `ThreadCommand`，不消费 `ClientResponse`。
- 不暴露完整消息内容；`latestSummary` 只使用短状态文案或最多 80 字的用户主动输入预览。
- 不替代 ThreadWindow 的 `/api/thread`。ThreadWindow 继续消费完整 thread 协议，StatusBubble 和桌宠消费 `/api/activity`。
