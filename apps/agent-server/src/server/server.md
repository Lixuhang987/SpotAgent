# server

## 目录职责

`server/` 是 agent-server 的进程入口与组合根。它负责启动同端口 HTTP + WebSocket 服务，按 request path 拆分 `/api/thread`、`/api/activity`、`/api/platform` 与 `/thread-window/*`，并把 core 与本目录其他模块组装成生产运行图。

本目录可以读取本地配置路径、创建长驻依赖和绑定 socket；不要在这里写 runtime event 翻译、tool 业务逻辑或平台原生实现。

## 文件

| 文件 | 职责 |
|------|------|
| `server.ts` | 暴露 `attachThreadSocketHandlers`、`attachPlatformSocketHandlers`、`startServer`、`startDefaultServer`、`LLMMode`、`readMCPConfig`、`createMCPClientFromConfig`、`resolveLLMMode`；解析 `~/.spotAgent` 路径；读取 MCP 配置；按配置创建 MCP client；作为 `node ... src/server/server.ts` 的可执行入口 |

## 运行入口

Electron main 会定位仓库根目录，然后执行：

```bash
node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts
```

`server.ts` 末尾用 `import.meta.url === pathToFileURL(process.argv[1]).href` 判断当前文件是否作为进程入口运行。测试可以直接 import `startServer`、socket handler、MCP client helper 与 LLM 模式 helper，不会自动占用 4317 端口。

## 关键机制

### 路径分派

```ts
const path = request.url?.split("?")[0];
if (path === "/api/activity") {
  attachActivitySocketHandlers(socket, { activityPublisher });
  return;
}
if (path === "/api/platform") {
  attachPlatformSocketHandlers(socket, { bridge });
  return;
}
if (path === "/api/thread") {
  attachThreadSocketHandlers(socket, dependencies);
  return;
}
socket.close();
```

`/api/thread`、`/api/activity` 和 `/api/platform` 是三条独立 WebSocket，不共享消息 union。`/thread-window/*` 由同一个 HTTP server 直接返回 React 静态资源，供 Electron ThreadWindow `BrowserWindow` 使用。未知 path 或缺失 path 会被关闭或返回 404，不默认为 thread socket。

按当前协议约束：

- `/api/thread` 接收 `ClientResponse` 和 `ThreadCommand`，其中 `ThreadCommand` 包含 `thread.start`、`thread.resume`、`thread.list`、`thread.delete`、`op.submit`、`workspace.list`；`ClientResponse` 会被交给 router 包装为 Agent `client_response` Op。
- `/api/activity` 只向 subscriber 发送 `AgentActivityEvent`；连接建立后由 `AgentActivityPublisher.attachConnection()` 立即发送 `activity.snapshot`，后续状态变化发送 `activity.changed`。如果启动测试未注入 activity publisher，该 path 会被关闭。
- `/api/platform` 接收 `PlatformBridgeMessage`，其中首次 `platform_bridge_hello` 会为当前 socket 生成 fencing token；同一 socket 的重复 hello 视为重试并保持幂等，避免 desktop 的 hello 兜底重发替换当前 bridge。之后的 `platform_response` 必须带着这条 socket 当前 token 才能唤醒 pending request，避免旧 socket 的晚到响应污染新连接。

### thread 订阅与关闭清理

```ts
if ("threadId" in message && typeof message.threadId === "string") {
  eventPublisher.subscribe(connectionId, message.threadId);
  boundThreads.add(message.threadId);
}
```

当前连接在收到带 `threadId` 的命令后会建立该 thread 的通知路由。`ThreadNotificationPublisher` 负责 `connectionId -> subscribed threadIds` 映射，所以一条 React `/api/thread` 连接可以同时接收多个 thread 的 notification 与 request；`thread.snapshot` 只作为用户打开历史 thread 或初始 prompt 建立 thread 后的状态入口。React ThreadWindow 非主动断开后不自动重连、不恢复订阅、不拉取 snapshot、不发送恢复命令。

permission / workspace ask 不再在 socket handler 内绑定 bridge token。turn 内部 request 先进入 Agent `rx_event`，server 的 Agent event pump 发布为 `ServerRequest`；React 回 `ClientResponse` 后，socket handler 只调用 `ThreadCommandRouter.handleResponse()`，router 将其包装为 Agent `client_response` Op。socket close 时，server 会异步触发 `commandRouter.interruptThread(threadId)` 并清理该 thread 的临时权限规则。

`workspace.list` 不需要 thread 绑定；它读取 workspace registry 后只向发起连接返回 `workspace.listed`。

### 组合根

```ts
const runtimeForThread = (threadId: string) => {
  let runtime = runtimeByThread.get(threadId);
  if (!runtime) {
    runtime = new AgentRuntime(llmClient, threadScopedTools.registryForThread(threadId), {
      permissionPolicy,
      blobStore,
      turnSummarizer: summarizer,
      onMetaToolActivate: async (activeThreadId) => {
        await threadScopedTools.activate(activeThreadId);
      },
    });
    runtimeByThread.set(threadId, runtime);
  }
  return runtime;
};
```

`startDefaultServer` 按 thread 缓存 `AgentRuntime`，让每个 thread 拥有独立的 tool registry 与激活状态；同时创建 `AgentManager` 维护 `threadId -> Agent`。这里是 core `AgentRuntime`、settings client、MCP 工具表、权限策略、BlobStore 与持久 Agent owner 的汇合点。

## 路径约定

`resolveServerPaths()` 集中生成以下路径：

- `~/.spotAgent/threads/`：thread JSON。
- `~/.spotAgent/blobs/`：图片附件和大段 tool 输出。
- `~/.spotAgent/log/`：LLM 网络日志。
- `~/.spotAgent/plugins/`：plugin manifest。
- `~/.spotAgent/mcp.json`：MCP server 配置。
- `~/.spotAgent/workspaces.json`：workspace 注册表。
- `~/.spotAgent/permissions.json`：永久权限规则。

## 编辑约束

- 新增长驻依赖时放进 `startDefaultServer`，保持 `startServer` 只接收已注入对象，方便单元测试。
- 新增 socket 顶层分支前先判断它是否属于 `PlatformBridgeMessage`、`ClientResponse` 或 `ThreadCommand`；`ClientResponse` 的业务处理应先包装成 Agent `client_response` Op，不要扩散自定义 union。
- 不在本目录写业务翻译逻辑；runtime event 翻译归 `protocol/`，thread 状态归 `thread/`，工具 / MCP 归 `actions/`。

## 下一步阅读

- thread 路由：[thread/thread.md](/Users/mu9/proj/handAgent/apps/agent-server/src/thread/thread.md)
- 桥接 token 细节：[bridges/bridges.md](/Users/mu9/proj/handAgent/apps/agent-server/src/bridges/bridges.md)
