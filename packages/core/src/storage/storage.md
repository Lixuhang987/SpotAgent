# storage

会话持久化。`PersistedSession`（元数据 + 消息历史 + 事件审计）由 `SessionStore` 接口暴露，提供内存 / 文件两种实现。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionRecord.ts` | `SessionMetadata` / `SessionEvent`（4 种：tool_call / tool_result / permission_request / error）/ `PersistedSession` |
| `SessionStore.ts` | `SessionStore` 接口：`create / get / delete / list / updateTitle / appendMessages / setMessages / appendEvents`；`SessionSummary` 是元数据精简视图 |
| `InMemorySessionStore.ts` | 内存 Map 实现，主要给测试用 |
| `FileSessionStore.ts` | 每会话一份 JSON 文件，落到 `~/.spotAgent/sessions/<id>.json`；读 / 写整文件；同一 session 的写操作通过内存队列串行化 |
| `index.ts` | 桶导出，agent-server 通过它消费 |

## 文件结构

```
~/.spotAgent/sessions/
  <session-id>.json    # PersistedSession
```

`PersistedSession`：

```ts
{
  version: 1,
  metadata: {
    id,
    title,
    createdAt,
    updatedAt,
    messageCount,
    actionBinding?: { pluginId, promptName, mcpServerIds },
  },
  messages: AgentMessage[],   // LLM 视角
  events: SessionEvent[],     // 审计视角
}
```

## 当前限制

- `FileSessionStore.appendMessages` 每次都重写整个文件；高频 tool 调用场景会放大写入。当前只保证同一进程内同一 session 的写操作串行化，不提供跨进程文件锁。
- `FileSessionStore.list` 需要遍历目录、读每个文件解析 metadata，O(N × file size)；超过几百会话会变慢。
- `FileSessionStore.get` / `list` 对解析失败 / 缺字段静默吞错（返回 null / 跳过），不利于排查。
- 两种实现均把内部数组直接交给调用方（无 deep clone），调用方误改会污染状态。

## 编辑此目录的约束

- `PersistedSession.version` 升级时需要写迁移逻辑，不要直接破坏历史文件。
- `SessionEvent` 是审计而非 UI 渲染源；UI 走 `ConversationMessage`，详见 [conversation](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md)。
- 不要把 LLM 内部状态（如重试计数）写到 `metadata`，那不是持久化职责。
- 新增字段时务必给 reasonable default，让旧文件可以无损读出。
- `metadata.actionBinding` 只表示创建 session 时绑定的 plugin action 和 MCP server ids；skill action 不写入此字段。不要在消息级别重复写入同一绑定。

## 相关文档

- 调用方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)（`SessionPersistence` 是 agent-server 内唯一直接消费者）
- 消息模型：[runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)
