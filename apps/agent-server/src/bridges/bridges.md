# bridges

## 目录职责

`bridges/` 把 core 的抽象回调接到 desktop 或 ThreadWindow WebSocket。这里不执行 LLM 或 tool 逻辑，只维护 request-response、超时、socket 重绑和 token fencing。

`WebSocketPlatformBridge` 走 `/api/platform`；`ThreadPermissionBridge` 与 `ThreadWorkspaceAskBridge` 走 `/api/thread` 的 `ServerRequest` / `ClientResponse`。

## 文件

| 文件 | 职责 |
|------|------|
| `WebSocketPlatformBridge.ts` | 实现 core `PlatformBridge`；向 desktop 发送 `platform_request`，按 `requestId + BridgeToken` 等待 `platform_response` |
| `ThreadPermissionBridge.ts` | 实现 `FilePermissionPolicy` 的 `AskResolver`；向当前 thread 绑定连接发送 `permission.requested`，等待 `permission.answered` |
| `ThreadWorkspaceAskBridge.ts` | 实现 `workspace.askUser` 的 `WorkspaceAskResolver`；向当前 thread 绑定连接串行发送 `workspace.requested`，等待用户选择或取消 |

## 三条桥的差异

| 桥 | 请求来源 | 回流消息 | 默认超时 | 绑定粒度 |
|------|------|------|------|------|
| `WebSocketPlatformBridge` | core `RemotePlatformAdapter` | `/api/platform` `platform_response` | `call()` 入参默认 15s | 当前发送 `platform_bridge_hello` 的 `/api/platform` socket |
| `ThreadPermissionBridge` | core `FilePermissionPolicy.ask` | `/api/thread` `permission.answered` | 60s | 当前 thread 绑定连接 |
| `ThreadWorkspaceAskBridge` | builtin `workspace.askUser` | `/api/thread` `workspace.answered` | 60s | 当前 thread 绑定连接，且同 thread 串行 |

## 关键机制

### Platform bridge token

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

### 权限审批绑定到 thread

```ts
const requestId = `${threadId}:${randomUUID()}`;
this.pending.set(requestId, {
  threadId,
  token: binding.token,
  resolve,
  timeout,
});
```

权限 requestId 带 `threadId` 前缀，server 层可以从 `permission.answered.requestId` 找回 thread，再用该连接持有的 binding token 调 `handleResponse()`。这保证一个 thread 断线重连后，旧 socket 不能答复新 socket 发起的审批。

权限桥的绑定由 `server/attachThreadSocketHandlers` 在 `input.submit` 时建立；如果 core 发起 permission ask 时没有 thread id 或没有当前绑定连接，直接返回 deny。

### Workspace ask 串行展示

```ts
const queue = this.queues.get(threadId) ?? [];
queue.push(job);
this.queues.set(threadId, queue);
this.dispatchNext(threadId);
```

同一 thread 内多个 `workspace.askUser` 会排队展示，避免桌面端同时出现多个 workspace 选择请求。当前 active job 完成、取消或超时后，才会派发下一个 job。

这条桥只服务 builtin `workspace.askUser` 的交互式选择；`workspace.list` / `workspace.listed` 是 `thread/ThreadCommandRouter` 的连接级列表命令，不经过 `ThreadWorkspaceAskBridge`。

## 失败语义

- platform bridge 不可用：抛 `PlatformBridgeOfflineError`，由上层 tool/runtime 变成 tool 失败。
- platform request 超时：抛 `PlatformBridgeTimeoutError`。
- permission 无 thread、无 socket、超时、断开：返回 deny，不抛错。
- workspace ask 无 thread、无 socket、超时、断开：返回 `{ cancelled: true }`，不抛错。

## 编辑约束

- 新增桥时必须定义 token/fencing 策略，避免旧 socket 响应影响新 socket。
- `handleResponse()` 必须先校验 requestId，再校验 token 和当前绑定。
- socket close 清理由对应 server handler 调用；thread request 由 `attachThreadSocketHandlers` 清理，platform bridge 由 `attachPlatformSocketHandlers` 清理。桥内部只清理自己的 pending 状态。

## 下一步阅读

- socket 分派：[server/server.md](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)
- 权限策略：[packages/core/src/permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md)
- workspace tool：[packages/core/src/workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md)
