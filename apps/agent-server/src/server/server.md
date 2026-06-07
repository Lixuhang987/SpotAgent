# server

## 目录职责

`server/` 是 agent-server 的进程入口与组合根。它负责启动同端口 HTTP + WebSocket 服务，按 request path 拆分 `/api/thread`、`/api/platform` 与 `/thread-window/*`，并把 core 与本目录其他模块组装成生产运行图。

## 文件

| 文件 | 职责 |
|------|------|
| `server.ts` | 暴露 `attachThreadSocketHandlers`、`attachPlatformSocketHandlers`、`startServer`、`startDefaultServer`；解析 `~/.spotAgent` 路径；读取 MCP 配置；按配置创建 MCP client；作为 `node ... src/server/server.ts` 的可执行入口 |

## 运行入口

desktop 的 `AgentServerService` 会定位仓库根目录，然后执行：

```bash
node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts
```

`server.ts` 末尾用 `import.meta.url === pathToFileURL(process.argv[1]).href` 判断当前文件是否作为进程入口运行。测试可以直接 import `startServer` / `handleSocketMessage`，不会自动占用 4317 端口。

## 关键机制

### 路径分派

```ts
const path = request.url?.split("?")[0];
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

`/api/thread` 和 `/api/platform` 是两条独立 WebSocket。`/thread-window/*` 由同一个 HTTP server 直接返回 React 静态资源，供桌面端 `WKWebView` 使用。未知 path 或缺失 path 会被关闭或返回 404，不默认为 thread socket。

按最小协议约束：

- `/api/thread` 接收 `ClientResponse` 和 `ThreadCommand`。
- `/api/platform` 接收 `PlatformBridgeMessage`，其中 `platform_bridge_hello` 会为当前 socket 生成 fencing token；之后的 `platform_response` 必须带着这条 socket 当前 token 才能唤醒 pending request，避免旧 socket 的晚到响应污染新连接。

### thread 绑定与关闭清理

```ts
if (message.type === "turn.start") {
  if (permissionBridge && !boundThreads.has(message.threadId)) {
    boundThreads.set(
      message.threadId,
      permissionBridge.bindThread(message.threadId, sendThread),
    );
  }
}
```

`turn.start` 是 permission / workspace 回流的绑定时机。当前连接在收到带 `threadId` 的命令后会建立该 thread 的通知路由。socket close 时会按 token 解绑，旧 socket 只能取消自己 token 下的 pending 请求；如果同一 thread 已被新 socket 绑定，旧 socket close 不会清掉新绑定。

`ThreadNotificationPublisher` 负责 `connectionId -> subscribed threadIds` 映射，所以一条 desktop 连接可以同时接收多个 thread 的通知，并靠 `thread.snapshot` 恢复各自状态。若关闭的 socket 仍持有某个 thread 的 permission binding，server 会异步触发 `commandRouter.interruptThread(threadId)` 并清理该 thread 的临时权限规则；若 binding 已被新 socket 接管，旧 socket close 不会中断新连接。

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

`startDefaultServer` 按 thread 缓存 `AgentRuntime`，让每个 thread 拥有独立的 tool registry 与激活状态。这里是 core `AgentRuntime`、settings client、MCP 工具表、权限策略和 BlobStore 的汇合点。

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
- 新增 socket 顶层分支前先判断它是否属于 `PlatformBridgeMessage`、`ClientResponse` 或 `ThreadCommand`；不要再扩散旧 union。
- 不在本目录写业务翻译逻辑；runtime event 翻译归 `protocol/`，thread 状态归 `thread/`，工具 / MCP 归 `actions/`。

## 下一步阅读

- thread 路由：[thread/thread.md](/Users/mu9/proj/handAgent/apps/agent-server/src/thread/thread.md)
- 桥接 token 细节：[bridges/bridges.md](/Users/mu9/proj/handAgent/apps/agent-server/src/bridges/bridges.md)
