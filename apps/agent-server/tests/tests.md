# tests

## 目录职责

`apps/agent-server/tests` 是 agent-server 的 Vitest 测试集合。测试目录按源码职责分组，用来验证当前主路径边界：server 顶层消息分派、thread / turn 命令路由与 notification 发布、protocol 翻译、settings 热加载、actions / MCP 工具组合、bridges 回流通道。

## 直接子节点索引

| 子节点 | 职责 |
|------|------|
| `server/` | `startServer`、`attachThreadSocketHandlers`、`attachPlatformSocketHandlers`、顶层 `PlatformBridgeMessage / ThreadCommand / ClientResponse` 分派、按 MCP 配置创建 client、LLM 模式解析、Computer Use client 选择 |
| `thread/` | `ThreadCommandRouter`、`ThreadNotificationPublisher`、`ThreadRuntimeOrchestrator`、`ThreadPersistence`、thread 级工具激活状态 |
| `protocol/` | `MessageTranslator` 的 `ThreadNotification`、审计事件、用户附件和 image STUB 翻译 |
| `settings/` | `SettingsBackedLLMClient` 与 `SettingsBackedToolRegistry` 的 stamp 缓存和热加载 |
| `actions/` | `ActionBindingResolver`、`MCPServerRegistry`、`ComputerUseMCPClient`、`ThreadScopedToolRegistry` |
| `bridges/` | platform bridge、permission bridge、workspace ask bridge 的 token fencing、超时和断线语义 |
| `support/` | 测试辅助实现，目前包含内存 BlobStore |
| `path-alias.test.ts` | 扫描测试目录内跨包 import，验证 `@handagent/core/*` path alias 能覆盖测试引用 |

## 运行方式

全量：

```bash
bash ./scripts/test.sh
```

单目录或单文件：

```bash
pnpm exec vitest run apps/agent-server/tests/thread/ThreadCommandRouter.test.ts
pnpm exec vitest run apps/agent-server/tests/bridges
```

## 新增测试约束

- 新增源码文件时，优先把测试放进同职责测试目录。
- 不把 `.test.ts` 放进 `src/`。
- `thread/` 相关测试应覆盖 `thread.snapshot` 恢复、单连接多 thread 通知路由、运行中删除或中断等主路径语义。
- `server/` 相关测试应覆盖 `/api/thread` 与 `/api/platform` 的路径拆分、顶层三类消息分派，以及 `ServerRequest -> ClientResponse` 回流。
- 涉及 socket 回流的测试应覆盖旧 token 晚到、socket close、timeout 三类失败语义。
- 涉及目录移动时，先跑 `bash ./scripts/test.sh`，再跑 Swift 验证，确保 desktop 启动路径仍能定位 agent-server 入口。
