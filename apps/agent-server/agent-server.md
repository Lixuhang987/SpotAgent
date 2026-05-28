# agent-server

`apps/agent-server` 是本地 WebSocket 会话桥（Node + TypeScript）。desktop 将它作为子进程启动，它监听 `ws://127.0.0.1:4317/api/session`，把桌面端的 `SessionMessage` 路由到 core `AgentRuntime`，并通过反向 bridge 向 desktop 请求平台能力、权限审批和 workspace 选择。

## 直接子节点

| 子节点 | 文档 | 职责 |
|------|------|------|
| `src/` | [src/src.md](/Users/mu9/proj/handAgent/apps/agent-server/src/src.md) | agent-server 源码；按 `server / session / protocol / settings / actions / bridges` 拆分 |
| `tests/` | [tests/tests.md](/Users/mu9/proj/handAgent/apps/agent-server/tests/tests.md) | agent-server 单元测试；目录结构跟 `src/` 职责对齐 |
| `package.json` | 无独立文档 | workspace 包声明；`main` 和 `start` 指向 `src/server/server.ts` |
| `node_modules/` | 不纳入仓库文档 | pnpm 安装产物，不提交、不维护文档 |

## 在分层中的位置

```mermaid
flowchart LR
  A["apps/desktop<br/>Swift / SwiftUI"] -->|"SessionMessage / PlatformBridgeMessage"| B["apps/agent-server<br/>Node WebSocket bridge"]
  B --> C["@handagent/core<br/>runtime / tools / storage / protocol"]
  B -->|"platform_request / permission_request / workspace_ask_request"| A
```

## 启动与组合

desktop 侧 `AgentServerService` 会定位仓库根目录并启动：

```bash
node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts
```

启动后 `src/server/server.ts` 会完成组合：

1. 构造 `FileSessionStore`、`FilesystemBlobStore`、`FileNetworkLogger`、`FileWorkspaceRegistry`。
2. 读取 `~/.spotAgent/mcp.json` 并创建 `MCPServerRegistry`。
3. 创建 `WebSocketPlatformBridge`、`SessionPermissionBridge`、`SessionWorkspaceAskBridge`。
4. 通过 `SettingsBackedToolRegistry` 注册 builtin tools。
5. 通过 `SettingsBackedLLMClient` 或 `MockLLMClient` 选择 LLM 模式。
6. 按 session 缓存 `AgentRuntime`，注入 session 级 tool registry、permission policy、blob store 和 turn summarizer。
7. 创建 `SessionPersistence`、`SessionRuntimeOrchestrator`、`SessionRouter`。
8. 启动 WebSocketServer，给每条 socket 挂载 session/platform/permission/workspace 分派逻辑。

## 主消息流

```mermaid
flowchart TD
  A["desktop SessionSocketClient"] --> B["server/attachSessionSocketHandlers"]
  B --> C{"platform / response / user message?"}
  C -- "platform" --> D["bridges/WebSocketPlatformBridge"]
  C -- "permission/workspace response" --> E["bridges/*Bridge.handleResponse"]
  C -- "session message" --> F["session/SessionRouter"]
  F --> G["session/SessionRuntimeOrchestrator"]
  G --> H["@handagent/core AgentRuntime"]
  H --> I["protocol/MessageTranslator"]
  I --> J["desktop SessionWindow"]
  G --> K["session/SessionPersistence"]
```

## 与文件系统约定

| 路径 | 写入方 | 读取方 | 说明 |
|------|--------|--------|------|
| `~/.spotAgent/settings.json` | desktop settings | `settings/` | LLM provider/model/API 与 builtin tool 开关；按文件 stamp 热加载 |
| `~/.spotAgent/sessions/<id>.json` | `session/SessionPersistence` | agent-server / desktop 历史列表 | `PersistedSession`，包含 messages 与 events |
| `~/.spotAgent/blobs/` | `protocol/composeUserContent`、core runtime summary | LLM adapter /后续 tool | 图片附件、大段 tool 输出与 summary 元数据 |
| `~/.spotAgent/log/` | `FileNetworkLogger` | 人工排查 | LLM 请求/响应 JSONL |
| `~/.spotAgent/workspaces.json` | desktop settings + core registry | agent-server / desktop | workspace 注册表 |
| `~/.spotAgent/permissions.json` | core `FilePermissionPolicy` | agent-server | 永久权限规则 |
| `~/.spotAgent/plugins/<plugin-id>/plugin.json` | 用户/安装流程 | desktop / `actions/ActionBindingResolver` | plugin action manifest |
| `~/.spotAgent/mcp.json` | 用户/安装流程 | `server/readMCPConfig` | 全局 MCP server 配置 |

## LLM 模式

- 默认是 `settings`：读取 `~/.spotAgent/settings.json`，使用 `SettingsBackedLLMClient`，并启用 `TurnSummarizer`。
- `HANDAGENT_LLM_MODE=mock` 时使用 core `MockLLMClient`，关闭 summarizer，并允许未激活 session 暴露 builtin tools，方便 mock QA 触发固定 tool 场景。
- 打包 mock QA 可执行：

```bash
bash ./scripts/package-app.sh --mock-llm
open dist/HandAgentDesktop.app
```

## 编辑约束

- 不在 `agent-server` 内定义跨进程 DTO；会话帧走 `@handagent/core/protocol/SessionMessage.ts`，平台帧走 `@handagent/core/protocol/PlatformBridgeMessage.ts`。
- 不 import macOS、Swift、AppKit、SwiftUI 或 browser-only 模块；平台能力一律经 `PlatformAdapter` / `PlatformBridge`。
- 新增源码子目录时，更新 [src/src.md](/Users/mu9/proj/handAgent/apps/agent-server/src/src.md)；新增测试子目录时，更新 [tests/tests.md](/Users/mu9/proj/handAgent/apps/agent-server/tests/tests.md)。
- 修改 TypeScript 后必须重启 desktop app 才能生效，无 hot reload。
- 验证命令：`bash ./scripts/test.sh`；涉及 desktop 启动路径时同时跑 `bash ./scripts/swiftw test` 与 `bash ./scripts/swiftw build`。

## 调试入口

- 会话/事件问题先看 `~/.spotAgent/sessions/<id>.json`。
- LLM provider 或 tool calling 问题先看 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`。
- 平台能力无响应先看 `bridges/` 是否有 active desktop bridge，再看 desktop `PlatformBridgeService`。
