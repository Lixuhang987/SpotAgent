# bridges

## 目录职责

`bridges/` 只保留 agent-server 与 desktop 平台 socket 之间的桥接。这里不执行 LLM、tool、thread request-response 或 UI 业务逻辑。

权限审批与 workspace 选择已经迁移到 `agent/AgentRequestBroker.ts`：turn 内部产生的待回执请求先进入 Agent `rx_event`，再由 app-server 发布为 `/api/thread` 的 `ServerRequest`；React 回传的 `ClientResponse` 会被 app-server 包装成 `client_response` Op 投回 Agent `tx_sub`。

## 文件

| 文件 | 职责 |
|------|------|
| `WebSocketPlatformBridge.ts` | 实现 core `PlatformBridge`；向 desktop 发送 `platform_request`，按 `requestId + BridgeToken` 等待 `platform_response` |

## Platform bridge token

```ts
attach(send: Send): BridgeToken {
  const previousToken = this.currentToken;
  if (previousToken !== null) {
    this.failPendingForToken(previousToken, "desktop bridge replaced");
  }

  const token = ++this.nextToken;
  this.send = send;
  this.currentToken = token;
  return token;
}
```

新的 `/api/platform` socket 发送 `platform_bridge_hello` 后会替换旧 platform 绑定，并让旧 token 下的 pending request 以 offline 失败。旧 socket 晚到的 response 因 token 不匹配会被忽略。`WebSocketPlatformBridge` 不挂载在 `/api/thread`，也不与 ThreadWindow UI 共享 WebSocket；它只转发平台能力请求，不实现 macOS 能力。

## 失败语义

- platform bridge 不可用：抛 `PlatformBridgeOfflineError`，由上层 tool/runtime 变成 tool 失败。
- platform request 超时：抛 `PlatformBridgeTimeoutError`。

## 编辑约束

- 新增桥时必须定义 token/fencing 策略，避免旧 socket 响应影响新 socket。
- `/api/thread` 的 permission/workspace request-response 不再放进本目录；应先判断是否属于 `AgentRequestBroker` 的 Agent `rx_event` / `tx_sub` 通道。
- socket close 清理由对应 server handler 调用；platform bridge 只清理自己的 pending 状态。

## 下一步阅读

- socket 分派：[server/server.md](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)
- Agent request broker：[agent/agent.md](/Users/mu9/proj/handAgent/apps/agent-server/src/agent/agent.md)
- 平台接口：[packages/core/src/platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
