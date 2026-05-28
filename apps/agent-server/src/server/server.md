# server

## 目录职责

`server/` 是 agent-server 的进程入口与组合根。它负责启动 WebSocketServer、给每条 socket 挂上会话/平台/权限/workspace 处理器，并把 core 与本目录其他模块组装成生产运行图。

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

这段逻辑先把 `channel: "platform"` 的消息从普通 `SessionMessage` 中剥离。`platform_bridge_hello` 会为当前 socket 生成 fencing token；之后的 `platform_response` 必须带着这条 socket 当前 token 才能唤醒 pending request，避免旧 socket 的晚到响应污染新连接。

### 会话绑定与关闭清理

```ts
if (message.type === "user_message") {
  if (permissionBridge && !boundSessions.has(message.sessionId)) {
    boundSessions.set(
      message.sessionId,
      permissionBridge.bindSession(message.sessionId, sendSession),
    );
  }
}
```

`user_message` 是权限审批与 workspace 选择回流的绑定时机。socket close 时会按 token 解绑，旧 socket 只能取消自己 token 下的 pending 请求；如果同一 session 已经被新 socket 绑定，旧 socket close 不会清掉新绑定。

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
- 新增 socket 顶层分支前先判断它是否属于平台通道、审批回流、workspace 回流或普通 session 路由。
- 不在本目录写业务翻译逻辑；runtime event 翻译归 `protocol/`，会话状态归 `session/`，工具/MCP 归 `actions/`。

## 下一步阅读

- 会话路由：[session/session.md](/Users/mu9/proj/handAgent/apps/agent-server/src/session/session.md)
- 桥接 token 细节：[bridges/bridges.md](/Users/mu9/proj/handAgent/apps/agent-server/src/bridges/bridges.md)
