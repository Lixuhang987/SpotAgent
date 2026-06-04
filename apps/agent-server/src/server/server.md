# server

## 目录职责

`server/` 是 agent-server 的进程入口与组合根。它负责启动 WebSocketServer、给每条 socket 挂上平台消息、会话命令、客户端响应三类处理器，并把 core 与本目录其他模块组装成生产运行图。

## 文件

| 文件 | 职责 |
|------|------|
| `server.ts` | 暴露 `attachSessionSocketHandlers`、`startServer`、`handleSocketMessage`、`startDefaultServer`；解析 `~/.spotAgent` 路径；读取 MCP 配置；按配置创建 MCP client；作为 `node ... src/server/server.ts` 的可执行入口 |

## 运行入口

desktop 的 `AgentServerService` 会定位仓库根目录，然后执行：

```bash
node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts
```

`server.ts` 末尾用 `import.meta.url === pathToFileURL(process.argv[1]).href` 判断当前文件是否作为进程入口运行。测试可以直接 import `startServer` / `handleSocketMessage`，不会自动占用 4317 端口。

## 关键机制

### Socket 消息分派

```ts
if (isPlatformBridgeMessage(message)) {
  if (message.type === "platform_bridge_hello" && bridge) {
    bridgeToken = bridge.attach(sendPlatform);
  } else if (message.type === "platform_response") {
    bridge?.handleResponse(message.payload, bridgeToken);
  }
  return;
}
```

这段逻辑先把 `channel: "platform"` 的消息从其他顶层消息中剥离。`platform_bridge_hello` 会为当前 socket 生成 fencing token；之后的 `platform_response` 必须带着这条 socket 当前 token 才能唤醒 pending request，避免旧 socket 的晚到响应污染新连接。

当前 server 顶层只接收三类消息：

- `PlatformBridgeMessage`：平台桥接 hello / response。
- `ClientResponse`：desktop 对 `permission_ask`、`workspace_ask` 的回答。
- `SessionCommand`：会话创建、订阅、取消订阅、开跑、中断、列出、删除。

### 会话绑定、订阅与关闭清理

```ts
if (message.type === "turn_start") {
  if (permissionBridge && !boundSessions.has(message.sessionId)) {
    boundSessions.set(
      message.sessionId,
      permissionBridge.bindSession(message.sessionId, sendSession),
    );
  }
}
```

`turn_start` 是 permission / workspace 回流的绑定时机。`attachSessionSocketHandlers` 同时会在带 `sessionId` 的 `SessionCommand` 到达时自动订阅当前连接；`session_unsubscribe` 会移除订阅，并尝试解绑该连接持有的 permission / workspace token。socket close 时会按 token 解绑，旧 socket 只能取消自己 token 下的 pending 请求；如果同一 session 已经被新 socket 绑定，旧 socket close 不会清掉新绑定。

`SessionEventPublisher` 负责 `connectionId -> subscribed sessionIds` 映射，所以一条 desktop 连接可以同时订阅多个 session，并靠 `session_snapshot` 恢复各自状态。

### 组合根

```ts
const runtimeForSession = (sessionId: string) => {
  let runtime = runtimeBySession.get(sessionId);
  if (!runtime) {
    runtime = new AgentRuntime(llmClient, sessionScopedTools.registryForSession(sessionId), {
      permissionPolicy,
      blobStore,
      turnSummarizer: summarizer,
      onMetaToolActivate: async (activeSessionId) => {
        await sessionScopedTools.activate(activeSessionId);
      },
    });
    runtimeBySession.set(sessionId, runtime);
  }
  return runtime;
};
```

`startDefaultServer` 按 session 缓存 `AgentRuntime`，让每个 session 拥有独立的 tool registry 与激活状态。这里是 core `AgentRuntime`、settings client、MCP 工具表、权限策略和 BlobStore 的汇合点。

## 路径约定

`resolveServerPaths()` 集中生成以下路径：

- `~/.spotAgent/sessions/`：会话 JSON。
- `~/.spotAgent/blobs/`：图片附件和大段 tool 输出。
- `~/.spotAgent/log/`：LLM 网络日志。
- `~/.spotAgent/plugins/`：plugin manifest。
- `~/.spotAgent/mcp.json`：MCP server 配置。
- `~/.spotAgent/workspaces.json`：workspace 注册表。
- `~/.spotAgent/permissions.json`：永久权限规则。

## 编辑约束

- 新增长驻依赖时放进 `startDefaultServer`，保持 `startServer` 只接收已注入对象，方便单元测试。
- 新增 socket 顶层分支前先判断它是否属于 `PlatformBridgeMessage`、`ClientResponse` 或 `SessionCommand`；不要再扩散旧 union。
- 不在本目录写业务翻译逻辑；runtime event 翻译归 `protocol/`，会话状态归 `session/`，工具/MCP 归 `actions/`。

## 下一步阅读

- 会话路由：[session/session.md](/Users/mu9/proj/handAgent/apps/agent-server/src/session/session.md)
- 桥接 token 细节：[bridges/bridges.md](/Users/mu9/proj/handAgent/apps/agent-server/src/bridges/bridges.md)
