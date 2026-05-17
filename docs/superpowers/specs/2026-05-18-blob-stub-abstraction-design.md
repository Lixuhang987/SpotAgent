# Blob/Stub 抽象设计

## 1. 背景与目标

当前会话上下文中所有内容都直接内联：用户截图的 base64、`file.read` 工具的完整文件内容、未来可能新增的大段工具输出。这会带来三个问题：

- 大段内容反复进入 LLM 调用，token 成本随 turn 数线性放大。
- 临时性内容（一次性查看的文件）和长期性内容（贯穿整个 session 的关键信息）混在一起，无法区别对待。
- 图片附件目前在 `composeUserContent` 里被丢成 `[图片附件: image/png (id-xxx)]` 字符串，base64 实际从未到达 LLM；这是事实上的 stub，但缺少统一抽象、无法回读、无法扩展。

本设计引入一套统一的 **Blob + Stub** 抽象：大段内容写到本地磁盘，会话上下文中只放一个结构化 stub 引用，由 LLM 显式调用工具读取完整内容；工具输入参数 `cached` 控制读取后内容在上下文中的生命周期。

## 2. 核心概念

**Blob**：持久化在本地磁盘的一段二进制或文本内容，由 `blobId` 引用，存储路径稳定。

**Stub**：Blob 在 LLM 上下文中的一行结构化文本占位符，包含 blobId、kind、size、path 与可选 summary。stub 由 runtime 在渲染消息时统一格式化产出。

**Scope（cached 参数）**：LLM 在调用读取类工具时显式选择，控制读取结果的内容在后续上下文中的生命周期。

- `cached: "turn"` — 完整内容仅在当前 turn 内可见。turn 结束后由 summarizer 异步压缩成 summary，stub body 替换为 summary。
- `cached: "persist"` — 完整内容永久驻留在工具消息中，直到 session 结束。

`cached` 必填、无默认。LLM 必须显式承担权衡。

**Turn 边界**：从 agent-server 收到一条 `user_message` 开始，到 `AgentRuntime` 完成本次 tool loop（自然结束或触达 maxTurns），到下一条 `user_message` 之前为一个 turn。同一 turn 内，所有 assistant message 与 tool message 共享同一上下文。

## 3. 数据模型

新增类型：

```ts
interface BlobRecord {
  id: string;
  kind: string;
  size: number;
  path: string;
  summary?: string;
}

interface BlobStore {
  put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord>;
  get(id: string): Promise<BlobRecord | undefined>;
  readContent(id: string): Promise<Buffer>;
  setSummary(id: string, summary: string): Promise<void>;
}
```

`BlobRecord` 字段含义：

- `id` — `blob-<uuid>`，全局唯一。
- `kind` — 自由字符串，用于语义分类（如 `"image"`、`"tool_result"`、`"text_selection"`）。MVP 仅使用前两类，但保持开放。
- `size` — 字节数。
- `path` — 绝对路径。
- `summary` — turn 结束后由 summarizer 写入；image 类的 blob 暂不填充（无现成解码工具）。

`BlobStore` 默认实现 `FilesystemBlobStore` 把内容写到 `~/.spotAgent/blobs/<yyyy-mm-dd>/<uuid>.<ext>`，元数据（`BlobRecord` 字段）写到同目录下的 sidecar 文件 `<uuid>.meta.json`。`setSummary` 重写 sidecar；`get` 读取 sidecar；`readContent` 读取主文件。按用户指示**不自动清理**，由用户手动管理。

## 4. Stub 渲染格式

所有 stub 在 LLM 上下文中使用统一文本格式。属性集随场景变化：

**图片附件**（无 cached 字段，body 为空）：

```
[STUB id=blob-xyz kind=image size=234567 path="/Users/mu9/.spotAgent/blobs/2026-05-18/abc.png"]
[/STUB]
```

**cached=persist 的工具结果**：

```
[STUB id=blob-xyz kind=tool_result cached=persist size=234567 path="/Users/mu9/.spotAgent/blobs/2026-05-18/abc.txt"]
<完整内容>
[/STUB]
```

**cached=turn 的工具结果，turn 内**：

```
[STUB id=blob-xyz kind=tool_result cached=turn size=234567 path="..."]
<完整内容>
[/STUB]
```

**cached=turn 的工具结果，turn 后压缩态**：

```
[STUB id=blob-xyz kind=tool_result cached=turn summarized=true size=234567 path="..."]
<summary>
[/STUB]
```

stub 的渲染与解析集中在 [packages/core/src/runtime/Stub.ts](packages/core/src/runtime/Stub.ts) 一处，工具实现不直接拼接 stub 文本。

## 4.1 Runtime 内的消息元数据扩展

为了让 stub 的属性（cached、summarized）能跨 LLM 调用持续追踪，[AgentMessage](packages/core/src/runtime/AgentMessage.ts) 的 `tool` 分支扩展一个可选字段：

```ts
{
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  blob?: { id: string; cached: "turn" | "persist"; summarized?: boolean };
}
```

`content` 始终是「即将发给 LLM 的文本」（包含 STUB 标签和当下的 body）。`blob` 是渲染所需的元数据，不直接发给 LLM。turn 结束后 summarizer 把 summary 写回 BlobStore，runtime 用 `blob.id` 找到对应消息并重渲染 `content`，把 `summarized=true` 加到 STUB 标签上、把 body 替换为 summary。

## 5. 三类来源的处理路径

### 5.1 图片附件（image，固定 stub）

1. PromptPanel 提交 → SessionManager 收到 `UserMessageAttachment.image`（含 base64）。
2. SessionManager 解码 base64 → `BlobStore.put({ kind: "image", bytes, extension: mime→ext })`。
3. `composeUserContent` 把图片渲染成 stub 文本插入用户消息（body 为空）；丢弃 base64。
4. 图片 blob 永远以 stub 形态存在；后续若需要图像理解能力，由独立的 `image.describe` / vision 工具读取 blob 后产出文本结果，那个工具的结果走自己的 `cached` 机制。

### 5.2 file.read 结果

1. `FileReadTool.inputSchema` 增加 `cached: { enum: ["turn", "persist"] }`，`required: ["workspaceId", "relativePath", "cached"]`。
2. 工具实现保持不变（仍读取 workspace 内文件）；返回结构在 runtime 层被包成 stub。
3. AgentRuntime 在序列化 tool message 时：
   - 调 `BlobStore.put({ kind: "tool_result", bytes: Buffer.from(content), extension: "txt" })` 拿到 blobId 与 path。
   - 渲染为 stub 文本：完整 content 作为 body，stub 标签里记录 `cached` 值。
   - 在 turn 元数据里把该 tool message 标记为 `cached=turn` 或 `cached=persist`，供 summarizer 识别。

### 5.3 后续大段工具输出（扩展点）

工具协议层不变。约定：**工具的 input schema 里出现 `cached: { enum: ["turn", "persist"] }` 字段（required）即声明该工具走 stub 路径**。runtime 在序列化 tool result 时检查工具输入里是否包含 `cached`，若有则走 BlobStore + stub 渲染流程，否则保持原行为。

这条约定让 stub 能力的接入只需改工具自己的 schema 与文档，不用改 runtime。MVP 只对 `file.read` 启用，未来 `file.list` 大目录、`shell.exec` 大输出等都可以同样接入。

## 6. Turn 结束与 Summarizer

**触发时机**：`AgentRuntime` 完成一次 tool loop、即将 await 下一条 `user_message` 之前。压缩异步进行，不阻塞当前 assistant 回复（assistant 已经发送完毕），但要在下一次 LLM 调用之前完成（runtime 维护一个 promise，下一轮入口处 await）。

**输入**：本 turn 内所有 `cached=turn` 且尚未 summarize 的 tool messages 的完整 body + 元数据（工具名、输入参数）。

**输出**：每条 1-3 句话的 summary，强调保留行号、错误信息、关键变量等可被后续轮次引用的事实。

**模型选择**：从 [`~/.spotAgent/settings.json`](~/.spotAgent/settings.json) 的 `summarizerModel` 字段读取，缺省 `claude-haiku-4-5-20251001`。复用现有 `LLMClient` 抽象，独立实例。

**并发**：所有待压缩的 tool messages 并行调用，cap 为 4。

**失败处理**：单条压缩失败 → 保留完整 body 不压缩，记一条 warning 日志，下一轮 turn 结束时再次尝试。整批失败 → 不阻塞主循环。

**状态写回**：summarizer 把 summary 写到 `BlobRecord.summary` 字段，并通知 runtime 更新对应 tool message 的渲染（下次 LLM 调用时 stub body 自动变为 summary）。

## 7. 配置

新增设置项：

```jsonc
{
  "summarizerModel": "claude-haiku-4-5-20251001"
}
```

读取规则与现有模型设置一致，每次 turn 结束时读取，无需重启。

## 8. 改动清单

**新增文件**

- [packages/core/src/blob/BlobRecord.ts](packages/core/src/blob/BlobRecord.ts) — 类型定义。
- [packages/core/src/blob/BlobStore.ts](packages/core/src/blob/BlobStore.ts) — 接口。
- [packages/core/src/blob/FilesystemBlobStore.ts](packages/core/src/blob/FilesystemBlobStore.ts) — 默认实现。
- [packages/core/src/runtime/Stub.ts](packages/core/src/runtime/Stub.ts) — stub 文本的 render/parse。
- [packages/core/src/runtime/TurnSummarizer.ts](packages/core/src/runtime/TurnSummarizer.ts) — 异步压缩协调器。

**修改文件**

- [packages/core/src/tools/builtins/FileReadTool.ts](packages/core/src/tools/builtins/FileReadTool.ts) — 添加 `cached` 必填参数，inputSchema 与文档同步更新。
- [packages/core/src/tools/AgentTool.ts](packages/core/src/tools/AgentTool.ts) — 添加可选 `stubByDefault?: boolean`。
- [packages/core/src/runtime/AgentRuntime.ts](packages/core/src/runtime/AgentRuntime.ts) — tool result 序列化走 Stub；turn 元数据记录 cached；turn 结束触发 summarizer；下一轮入口 await pending summarize。
- [apps/agent-server/src/SessionManager.ts](apps/agent-server/src/SessionManager.ts) — `composeUserContent` 改为先把 image attachment 写入 BlobStore，再渲染为 stub；不再丢弃 base64。
- 设置 schema 与读取处加 `summarizerModel` 字段。

**测试**

- `BlobStore` 单元测试：put/get/readContent/setSummary 往返。
- `Stub` 单元测试：render/parse 互逆，覆盖三种 body 形态。
- `TurnSummarizer` 单元测试：模拟 LLM 返回，验证 summary 写回 + 失败重试。
- `AgentRuntime` 集成测试：一次 user message 触发 file.read（cached=turn）→ assistant 回复 → 下一轮 user message 前完成压缩 → 第二轮 LLM 调用看到的 stub body 是 summary。
- `SessionManager` 集成测试：image attachment 走 BlobStore，渲染为空 body 的 stub。

## 9. 不在范围内（明确 out-of-scope）

- 让 `file.read` 同时接受 `workspaceId+relativePath` 与 `blobId` 两种入参（按用户指示，限定 workspace；图片以后通过新工具或写入默认 workspace 的方式接入）。
- `image.describe` / vision 工具。
- Blob 的 UI 可视化（如在 SessionWindow 里点击 stub 弹出预览）。
- 跨 session 的 Blob GC / 配额管理。
- 历史 session 的迁移（项目尚未上线，无需考虑兼容）。

## 10. 决策记录

- **scope 二态而非三态**：用户已确认 `turn` / `persist` 二选一即可。
- **cached 必填、无默认**：强制 LLM 显式承担成本权衡，避免无脑 persist 撑大上下文。
- **summarizer 默认 Haiku 4.5**：压缩任务推理强度低，便宜快；但开放 `summarizerModel` 配置以备调整。
- **图片永远 stub、永不 inline**：图片的 base64 体积与上下文相性差；后续 vision 能力通过独立工具按需触发。
- **turn 边界以 user_message 为分界**：保留多步 tool loop 的完整推理上下文；模型在同一回合内规划-执行-验证不必反复 read。
- **summary 异步、不阻塞**：assistant 回复体验不受影响；下一轮入口处 await，保证下次 LLM 调用看到正确的压缩态。
- **不自动清理 blob 文件**：用户明确要求；后续若磁盘压力大再单独设计 GC。
