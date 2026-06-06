# agent-server

`apps/agent-server` 是本地 WebSocket thread 桥（Node + TypeScript）。desktop 将它作为子进程启动，它暴露 `ws://127.0.0.1:4317/api/thread` 给 React ThreadWindow，暴露 `ws://127.0.0.1:4317/api/platform` 给 Swift 宿主。`/api/thread` 接收 `ThreadCommand` / `ClientResponse` 并推送 `ThreadNotification` / `ServerRequest`；`/api/platform` 只承载 `PlatformBridgeMessage`，用于向 desktop 请求平台能力。

## 直接子节点

| 子节点 | 文档 | 职责 |
|------|------|------|
| `src/` | [src/src.md](/Users/mu9/proj/handAgent/apps/agent-server/src/src.md) | agent-server 源码；按 `server / thread / protocol / settings / actions / bridges` 拆分 |
| `tests/` | [tests/tests.md](/Users/mu9/proj/handAgent/apps/agent-server/tests/tests.md) | agent-server 单元测试；目录结构跟 `src/` 职责对齐 |
| `package.json` | 无独立文档 | workspace 包声明；`main` 和 `start` 指向 `src/server/server.ts` |
| `node_modules/` | 不纳入仓库文档 | pnpm 安装产物，不提交、不维护文档 |

## 在分层中的位置

```mermaid
flowchart LR
  A["apps/desktop<br/>Swift 宿主"] -->|"/api/platform PlatformBridgeMessage"| B["apps/agent-server<br/>Node WebSocket bridge"]
  W["apps/thread-window-web<br/>React ThreadWindow"] -->|"/api/thread ThreadCommand / ClientResponse"| B
  B --> C["@handagent/core<br/>runtime / tools / storage / protocol"]
  B -->|"/api/thread ThreadNotification / ServerRequest"| W
  B -->|"/api/platform PlatformBridgeMessage"| A
```

## 启动与组合

desktop 侧 `AgentServerService` 会定位仓库根目录并启动：

```bash
node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts
```

启动后 `src/server/server.ts` 会完成组合：

1. 构造 `FileThreadStore`、`FilesystemBlobStore`、`FileNetworkLogger`、`FileWorkspaceRegistry`。
2. 读取 `~/.spotAgent/mcp.json` 并创建 `MCPServerRegistry`。
3. 创建 `WebSocketPlatformBridge`、`ThreadPermissionBridge`、`ThreadWorkspaceAskBridge`。
4. 通过 `SettingsBackedToolRegistry` 注册 builtin tools。
5. 通过 `SettingsBackedLLMClient` 或 `MockLLMClient` 选择 LLM 模式。
6. 按 thread 缓存 `AgentRuntime`，注入 thread 级 tool registry、permission policy、blob store 和 turn summarizer。
7. 创建 `ThreadPersistence`、`ThreadRuntimeOrchestrator`、`ThreadNotificationPublisher`、`ThreadCommandRouter`。
8. 启动 WebSocketServer，按 request path 分流：`/api/thread` 挂载 thread command/response handler，`/api/platform` 挂载 platform bridge handler，未知 path 直接关闭。

## 主消息流

```mermaid
flowchart TD
  A["React /api/thread socket"] --> B["server/attachThreadSocketHandlers"]
  P["Swift /api/platform socket"] --> D["server/attachPlatformSocketHandlers"]
  D --> PB["bridges/WebSocketPlatformBridge"]
  B --> C{"ClientResponse / ThreadCommand"}
  C -- "ClientResponse" --> E["bridges/ThreadPermissionBridge<br/>bridges/ThreadWorkspaceAskBridge"]
  C -- "ThreadCommand" --> F["thread/ThreadCommandRouter"]
  F --> G["thread/ThreadRuntimeOrchestrator"]
  F --> H["thread/ThreadNotificationPublisher"]
  G --> I["@handagent/core AgentRuntime"]
  I --> J["protocol/MessageTranslator"]
  J --> H
  H --> K["React ThreadWindow"]
  G --> L["thread/ThreadPersistence"]
```

## 协议主干

- `/api/thread` 顶层只接收 `ThreadCommand`、`ClientResponse`。
- `/api/platform` 顶层只接收 `PlatformBridgeMessage`。
- thread 通知主干统一走 `ThreadNotification`；`thread.snapshot` 是恢复入口。
- permission / workspace 不再走旧协议 union，统一由 server 发 `ServerRequest`，React 回 `ClientResponse`。
- 单条 React thread socket 可以同时恢复多个 thread；没有 unsubscribe 协议，tab 关闭只取消 React 本地订阅。

## 与文件系统约定

| 路径 | 写入方 | 读取方 | 说明 |
|------|--------|--------|------|
| `~/.spotAgent/settings.json` | desktop settings | `settings/` | LLM provider/model/API 与 builtin tool 开关；按文件 stamp 热加载 |
| `~/.spotAgent/threads/<id>.json` | `thread/ThreadPersistence` | agent-server / desktop 历史列表 | `PersistedThread`，包含 messages 与 events |
| `~/.spotAgent/blobs/` | `protocol/composeUserContent`、core runtime summary | LLM adapter / 后续 tool | 图片附件、大段 tool 输出与 summary 元数据 |
| `~/.spotAgent/log/` | `FileNetworkLogger` | 人工排查 | LLM 请求/响应 JSONL |
| `~/.spotAgent/workspaces.json` | desktop settings + core registry | agent-server / desktop | workspace 注册表 |
| `~/.spotAgent/permissions.json` | core `FilePermissionPolicy` | agent-server | 永久权限规则 |
| `~/.spotAgent/plugins/<plugin-id>/plugin.json` | 用户/安装流程 | desktop / `actions/ActionBindingResolver` | plugin action manifest |
| `~/.spotAgent/mcp.json` | 用户/安装流程 | `server/readMCPConfig` | 全局 MCP server 配置 |

## LLM 模式

- 默认是 `settings`：读取 `~/.spotAgent/settings.json`，使用 `SettingsBackedLLMClient`，并启用 `TurnSummarizer`。
- `HANDAGENT_LLM_MODE=mock` 时使用 core `MockLLMClient`，关闭 summarizer，并允许未激活 thread 暴露 builtin tools，方便 mock QA 触发固定 tool 场景。
- 打包 mock QA 可执行：

```bash
bash ./scripts/package-app.sh --mock-llm
open dist/HandAgentDesktop.app
```

## 编辑约束

- 不在 `agent-server` 内定义跨进程 DTO；thread 命令走 `@handagent/core/protocol/ThreadCommand.ts`，thread 通知走 `@handagent/core/protocol/ThreadNotification.ts`，请求回流走 `ServerRequest` / `ClientResponse`，平台帧走 `@handagent/core/protocol/PlatformBridgeMessage.ts`。
- 不 import macOS、Swift、AppKit、SwiftUI 或 browser-only 模块；平台能力一律经 `PlatformAdapter` / `PlatformBridge`。
- 新增源码子目录时，更新 [src/src.md](/Users/mu9/proj/handAgent/apps/agent-server/src/src.md)；新增测试子目录时，更新 [tests/tests.md](/Users/mu9/proj/handAgent/apps/agent-server/tests/tests.md)。
- 修改 TypeScript 后必须重启 desktop app 才能生效，无 hot reload。
- 验证命令：`bash ./scripts/test.sh`；涉及 desktop 启动路径时同时跑 `bash ./scripts/swiftw test` 与 `bash ./scripts/swiftw build`。

## 调试入口

- thread / notification 问题先看 `~/.spotAgent/threads/<id>.json`。
- LLM provider 或 tool calling 问题先看 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`。
- 平台能力无响应先看 `bridges/` 是否有 active desktop bridge，再看 desktop `PlatformBridgeService`。
