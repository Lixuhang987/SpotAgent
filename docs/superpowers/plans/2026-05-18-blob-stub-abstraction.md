# Blob/Stub 抽象实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `2026-05-18-blob-stub-abstraction-design.md` 实现 BlobStore、Stub 渲染、`file.read` cached 参数、图片附件 blob 化与 turn 级摘要写回。

**Architecture:** `BlobStore` 负责磁盘持久化，`Stub` 负责上下文文本格式，`AgentRuntime` 只通过接口把带 `cached` 参数的工具结果包成 stub。`SessionManager` 在用户消息入库前把 image attachment 写成 blob 并渲染空 body stub，turn 结束后的 `TurnSummarizer` 负责把 `cached=turn` 的工具消息压缩回 summary。

**Tech Stack:** TypeScript、Node 标准库、Vitest、现有 `LLMClient` 与 `ToolRegistry` 抽象。

---

### Task 1: BlobStore 与 Stub 基础能力

**Files:**
- Create: `packages/core/src/blob/BlobRecord.ts`
- Create: `packages/core/src/blob/BlobStore.ts`
- Create: `packages/core/src/blob/FilesystemBlobStore.ts`
- Create: `packages/core/src/blob/blob.md`
- Create: `packages/core/src/runtime/Stub.ts`
- Test: `packages/core/tests/blob-store.test.ts`
- Test: `packages/core/tests/stub.test.ts`
- Modify: `packages/core/src/src.md`

- [ ] 写 `blob-store.test.ts`，覆盖 `put/get/readContent/setSummary` 往返、sidecar 元数据与日期目录。
- [ ] 写 `stub.test.ts`，覆盖 image 空 body、persist 完整 body、turn summary body，以及 parse 互逆。
- [ ] 运行单测确认因缺少模块失败。
- [ ] 实现 `BlobRecord`、`BlobStore`、`FilesystemBlobStore` 与 `Stub`。
- [ ] 更新 `packages/core/src/src.md` 增加 `blob/` 索引。
- [ ] 重跑相关单测确认通过。

### Task 2: file.read cached 参数与 runtime stub tool 结果

**Files:**
- Modify: `packages/core/src/tools/AgentTool.ts`
- Modify: `packages/core/src/tools/defineTool.ts`
- Modify: `packages/core/src/tools/builtins/FileReadTool.ts`
- Modify: `packages/core/src/runtime/AgentMessage.ts`
- Modify: `packages/core/src/runtime/AgentRuntime.ts`
- Modify: `packages/core/src/tools/tools.md`
- Modify: `packages/core/src/runtime/runtime.md`
- Test: `packages/core/tests/file-tools.test.ts`
- Test: `packages/core/tests/runtime.test.ts`

- [ ] 先改测试：`file.read` 必须传 `cached: "turn" | "persist"`，schema required 包含 `cached`。
- [ ] 先改 runtime 测试：带 `cached=turn` 的 tool 结果写入 BlobStore，LLM 下一轮收到 STUB 包裹的完整 body，tool message 带 `blob` 元数据。
- [ ] 运行测试确认红灯。
- [ ] 给 `AgentTool` 增加可选 `stubByDefault?: boolean`，`defineTool` 支持透传。
- [ ] 更新 `FileReadTool` schema、描述、输出兼容现有 `{content}`，并标记 `stubByDefault`。
- [ ] `AgentRuntime` 构造函数注入可选 `blobStore`，工具输入里有合法 `cached` 且 tool 支持 stub 时，把序列化结果写入 BlobStore 并渲染 STUB。
- [ ] 重跑相关单测确认通过。

### Task 3: TurnSummarizer 与下一轮入口等待

**Files:**
- Create: `packages/core/src/runtime/TurnSummarizer.ts`
- Modify: `packages/core/src/runtime/AgentRuntime.ts`
- Modify: `packages/core/src/config/ModelSettings.ts`
- Modify: `packages/core/src/config/config.md`
- Test: `packages/core/tests/turn-summarizer.test.ts`
- Test: `packages/core/tests/runtime.test.ts`
- Test: `packages/core/tests/model-settings.test.ts`

- [ ] 先写 `TurnSummarizer` 测试：成功时写回 summary 并重渲染消息，失败时保留完整 body 且下次可重试。
- [ ] 先写 runtime 测试：第一轮结束触发异步摘要，第二轮 LLM 调用前等待 pending summary，看到 `summarized=true` 与 summary body。
- [ ] 先写 settings 测试：`summarizerModel` 默认值和 settings 覆盖。
- [ ] 运行测试确认红灯。
- [ ] 实现 `TurnSummarizer`，并在 `AgentRuntime` turn 入口 await 上次 pending、turn 结束启动本次 pending。
- [ ] 扩展 `loadModelSettings()` 读取 `llm.summarizerModel`。
- [ ] 重跑相关单测确认通过。

### Task 4: 图片附件写入 BlobStore

**Files:**
- Modify: `apps/agent-server/src/MessageTranslator.ts`
- Modify: `apps/agent-server/src/SessionManager.ts`
- Modify: `apps/agent-server/src/SessionManager.test.ts`
- Modify: `apps/agent-server/agent-server.md`

- [ ] 先写 SessionManager 测试：image attachment base64 被写入 BlobStore，用户消息只含空 body image STUB。
- [ ] 运行测试确认红灯。
- [ ] 把 `composeUserContent` 改为 async，注入 BlobStore，image attachment 由 `mimeType` 映射扩展名并写入 store。
- [ ] 在 `SessionManager` options 中注入 `blobStore`，默认使用 `FilesystemBlobStore`。
- [ ] 更新 agent-server 文档的路径约定。
- [ ] 重跑相关单测确认通过。

### Task 5: 全量验证、提交、合并清理

**Files:**
- Modify: `packages/core/src/runtime/runtime.md`
- Modify: `packages/core/src/tools/tools.md`
- Modify: `packages/core/src/config/config.md`
- Modify: `apps/agent-server/agent-server.md`

- [ ] 运行 `bash ./scripts/test.sh`。
- [ ] 运行 `bash ./scripts/swiftw test`。
- [ ] 运行 `bash ./scripts/swiftw build`。
- [ ] 检查 `git diff` 与文档索引。
- [ ] `git add` 并提交。
- [ ] 切回 main，合并 `codex/blob-stub-abstraction`。
- [ ] 删除 `.worktrees/blob-stub-abstraction` 和对应分支。
