# src

## 目录职责

`apps/agent-server/src` 是本地 Node agent-server 的源码层。它把 `/api/thread`、`/api/platform`、core runtime、settings、MCP、Agent request broker 和持久化组装成本地 thread 服务。

本目录不承载 macOS UI，不实现平台原生能力，也不定义 core 协议 DTO。

## 子目录索引

| 子目录 | 子文档 | 职责 |
|------|------|------|
| `activity/` | [activity/activity.md](/Users/mu9/proj/handAgent/apps/agent-server/src/activity/activity.md) | 从 thread 通知和待回执请求派生 `/api/activity` 轻量运行态 |
| `agent/` | [agent/agent.md](/Users/mu9/proj/handAgent/apps/agent-server/src/agent/agent.md) | 持久 Agent owner，维护 `threadId -> Agent`，通过 `tx_sub` 接收 `Op`，通过 `rx_event` 输出通知与待回执请求 |
| `server/` | [server/server.md](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md) | 进程入口、WebSocket socket 绑定、组合根与 `~/.spotAgent` 路径解析 |
| `thread/` | [thread/thread.md](/Users/mu9/proj/handAgent/apps/agent-server/src/thread/thread.md) | thread 路由、一轮 turn 编排、持久化恢复与删除 |
| `protocol/` | [protocol/protocol.md](/Users/mu9/proj/handAgent/apps/agent-server/src/protocol/protocol.md) | core runtime event、thread 消息、审计事件与多模态 STUB 的翻译 |
| `settings/` | [settings/settings.md](/Users/mu9/proj/handAgent/apps/agent-server/src/settings/settings.md) | `~/.spotAgent/settings.json` 驱动的 LLM client 与 builtin tool 热加载 |
| `actions/` | [actions/actions.md](/Users/mu9/proj/handAgent/apps/agent-server/src/actions/actions.md) | plugin action binding、全局 / thread scoped MCP、Computer Use 兼容层与 thread 级工具表 |
| `bridges/` | [bridges/bridges.md](/Users/mu9/proj/handAgent/apps/agent-server/src/bridges/bridges.md) | desktop 平台 RPC bridge；thread request-response 归 `agent/AgentRequestBroker` |

## 内部依赖方向

- `server/` 是组合根；只有这里创建长驻依赖、读取 `~/.spotAgent` 路径并绑定 HTTP / WebSocket。
- `agent/` 维护持久 Agent 映射，运行期输入和 UI 回执进入 Agent 的 `tx_sub`；ThreadNotification 与 ServerRequest 从 Agent `rx_event` 交给 app-server 分发；旧 `ThreadRuntimeOrchestrator` 只作为 Agent 内部 turn 执行器被调用。
- `thread/` 消费已经注入的 agent manager、persistence、publisher、workspace registry 和 action binding resolver，不直接创建 LLM client、MCP client 或 platform adapter；公开运行期输入只处理 `op.submit`。
- `protocol/` 只做 runtime event、conversation message、audit event 和 attachment STUB 的翻译。
- `settings/` 把 `settings.json` 热加载成 LLM client 与 builtin tool registry。
- `actions/` 组合 builtin tools、MCP tools 与 plugin action binding，产出 thread 级工具表。
- `bridges/` 只把 platform bridge 映射到 desktop socket，不执行 tool 业务逻辑；permission/workspace request-response 不再放在 bridges。

## 边界规则

- 跨进程协议类型只从 `@handagent/core/protocol/*` 引用，不在 `agent-server` 内复制 DTO。
- core 的 runtime、tool、storage、permission、workspace 通过 `@handagent/core/<subpath>` package alias 引用，不使用跨包相对路径。
- `server/` 是组合根；新增长驻服务要先在这里注入，再通过构造函数传给下游目录。
- `thread/` 不直接创建 LLM client、MCP client 或 platform adapter；它只消费构造好的 runtime 与 persistence。
- `bridges/` 只负责 platform bridge 接口映射到 desktop socket，不执行 tool 业务逻辑。
- `/api/thread` 与 `/api/platform` 不共享消息 union；新增协议字段先改 `packages/core/src/protocol`，再在本目录接线。

## 推荐阅读顺序

1. 先读 [server/server.md](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)，理解依赖如何被组装。
2. 再读 [thread/thread.md](/Users/mu9/proj/handAgent/apps/agent-server/src/thread/thread.md)，理解一条 turn 的生命周期。
3. 再读 [protocol/protocol.md](/Users/mu9/proj/handAgent/apps/agent-server/src/protocol/protocol.md)，理解消息如何给 UI 和审计落盘。
4. 最后按问题域阅读 `settings/`、`actions/`、`bridges/`。
