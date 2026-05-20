# 图片附件多模态消息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户主动提交的图片附件以多模态 content part 进入 LLM 请求，同时持久化层继续只保存 blob stub，不把 base64 写入会话历史。

**Architecture:** `SessionPersistence` 继续把图片落到 `BlobStore` 并保存可读 STUB；`MessageTranslator` 增加运行时专用转换，把历史 user message 中的 image STUB 转成 `{ type: "image", blobId, mimeType }` part。`AgentRuntime` 把 `blobStore` 透传给 `LLMClient.complete()`；`VercelAdapters` 在调用 AI SDK 前按 blobId 读取图片 bytes，映射成 SDK image part，并拒绝缺少 blobStore、blob 缺失、非 image blob 与 completion API 多模态路径。

**Tech Stack:** TypeScript、Vitest、AI SDK `ModelMessage`、仓库现有 `BlobStore` / `Stub` / `AgentRuntime`。

---

### Task 1: AgentMessage 与 LLMClient options

**Files:**
- Modify: `packages/core/src/runtime/AgentMessage.ts`
- Modify: `packages/core/src/llm/LLMClient.ts`
- Test: `packages/core/tests/runtime/agent-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

在 `packages/core/tests/runtime/agent-runtime.test.ts` 增加测试，断言 runtime 会把 `blobStore` 透传给 fake LLM：

```ts
it("passes the configured blob store into the LLM client", async () => {
  const blobStore = {
    put: vi.fn(),
    get: vi.fn(),
    readContent: vi.fn(),
    setSummary: vi.fn(),
  };
  let seenOptions: unknown;
  const runtime = new AgentRuntime(
    {
      async complete(_messages, _tools, options) {
        seenOptions = options;
        return { message: { role: "assistant", content: "ok" } };
      },
    },
    new ToolRegistry(),
    { blobStore },
  );

  await runtime.runWithMessages([{ role: "user", content: "hello" }]);

  expect(seenOptions).toEqual({ blobStore });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest packages/core/tests/runtime/agent-runtime.test.ts --run`

Expected: FAIL because `LLMClient.complete` does not accept an options argument and `AgentRuntime` does not pass `blobStore`.

- [ ] **Step 3: Write minimal implementation**

Add content part types:

```ts
export type AgentTextContentPart = { type: "text"; text: string };
export type AgentImageContentPart = {
  type: "image";
  blobId: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};
export type AgentUserContent = string | Array<AgentTextContentPart | AgentImageContentPart>;
```

Change user messages to `content: AgentUserContent`. Add `LLMCompleteOptions = { blobStore?: BlobStore }`, update `LLMClient.complete(messages, tools, options?)`, and pass `{ blobStore: this.blobStore }` from `AgentRuntime` only when configured.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest packages/core/tests/runtime/agent-runtime.test.ts --run`

Expected: PASS.

---

### Task 2: Persisted image STUB to runtime multimodal content

**Files:**
- Modify: `apps/agent-server/src/MessageTranslator.ts`
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`
- Test: `apps/agent-server/src/MessageTranslator.test.ts`
- Test: `apps/agent-server/src/SessionRuntimeOrchestrator.test.ts`

- [ ] **Step 1: Write failing translator tests**

Add tests that assert `composeUserContent` still persists STUB text, and a new `agentMessagesToRuntimeMessages()` turns that STUB into text + image parts:

```ts
const persisted = await composeUserContent("描述图片", [
  {
    kind: "image",
    id: "img-1",
    mimeType: "image/png",
    base64: Buffer.from("png-bytes").toString("base64"),
  },
], blobStore);

expect(agentMessagesToRuntimeMessages([{ role: "user", content: persisted }])).toEqual([
  {
    role: "user",
    content: [
      { type: "text", text: "描述图片" },
      { type: "image", blobId: "blob-1", mimeType: "image/png" },
    ],
  },
]);
```

- [ ] **Step 2: Write failing orchestrator test**

In `SessionRuntimeOrchestrator.test.ts`, submit a user message with an image attachment and assert the fake runtime receives `content` as typed text/image parts, while persisted session messages still contain STUB text.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm vitest apps/agent-server/src/MessageTranslator.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts --run
```

Expected: FAIL because `agentMessagesToRuntimeMessages` does not exist and orchestrator passes persisted messages directly.

- [ ] **Step 4: Implement conversion**

Implement `agentMessagesToRuntimeMessages(messages)` in `MessageTranslator.ts`:

```ts
export function agentMessagesToRuntimeMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content !== "string") return message;
    return { ...message, content: parseUserContentParts(message.content) };
  });
}
```

Use `parseStub` to detect full STUB blocks where `kind=image`; infer mime type from `path` extension. Preserve non-image STUBs and plain text as `{ type: "text" }`, and collapse to string when no image parts exist.

- [ ] **Step 5: Use conversion before runtime**

In `SessionRuntimeOrchestrator.handleUserMessage`, keep persistence unchanged, but call runtime with `agentMessagesToRuntimeMessages(history)`.

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
pnpm vitest apps/agent-server/src/MessageTranslator.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts --run
```

Expected: PASS.

---

### Task 3: AI SDK image mapping and validation

**Files:**
- Modify: `packages/core/src/llm/VercelAdapters.ts`
- Modify: `packages/core/src/llm/VercelClient.ts`
- Test: `packages/core/tests/llm/vercel-client.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Add tests covering:

```ts
await expect(toVercelMessages([
  { role: "user", content: [{ type: "text", text: "描述" }, { type: "image", blobId: "blob-1", mimeType: "image/png" }] },
], { blobStore })).resolves.toEqual([
  { role: "user", content: [{ type: "text", text: "描述" }, { type: "image", image: Buffer.from("png-bytes"), mediaType: "image/png" }] },
]);
```

Also assert missing blobStore, missing blob, and non-image blob throw clear errors.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm vitest packages/core/tests/llm/vercel-client.test.ts --run`

Expected: FAIL because `toVercelMessages` is synchronous and does not know `blobStore`.

- [ ] **Step 3: Implement async adapter**

Change `toVercelMessages(messages, options?)` to async. For `image` parts:

```ts
const record = await options.blobStore.get(part.blobId);
if (!record) throw new Error(`Image blob not found: ${part.blobId}`);
if (record.kind !== "image") throw new Error(`Blob is not an image: ${part.blobId}`);
const image = await options.blobStore.readContent(part.blobId);
return { type: "image" as const, image, mediaType: part.mimeType };
```

Update `VercelClient.complete()` to `await toVercelMessages(messages, options)`.

- [ ] **Step 4: Reject completion API for multimodal**

Track selected `api` in `VercelClient`. If `api === "completion"` and user content contains image parts, throw `OpenAI completion API does not support image content. Use chat or responses.` before calling `generateText`.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm vitest packages/core/tests/llm/vercel-client.test.ts --run`

Expected: PASS.

---

### Task 4: Redact image payloads in network logs

**Files:**
- Modify: `packages/core/src/logging/createLoggingFetch.ts`
- Test: `packages/core/tests/logging/logging-fetch.test.ts`

- [ ] **Step 1: Write failing test**

Add a test whose request JSON contains AI SDK image payload fields:

```ts
body: JSON.stringify({
  messages: [{ role: "user", content: [{ type: "image", image: "base64-large", mediaType: "image/png" }] }],
})
```

Assert logged body replaces the image value with `[redacted image payload]`.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm vitest packages/core/tests/logging/logging-fetch.test.ts --run`

Expected: FAIL because logger currently stores parsed JSON unchanged.

- [ ] **Step 3: Implement recursive redaction**

After parsing JSON, recursively redact object properties named `image` when the same object has `type: "image"`, and redact strings starting with `data:image/`.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm vitest packages/core/tests/logging/logging-fetch.test.ts --run`

Expected: PASS.

---

### Task 5: Docs, full verification, and commit

**Files:**
- Modify: `docs/TODO.md`
- Modify: `docs/architecture-review.md`
- Modify: `docs/dev.md`
- Modify as needed: module docs that describe message / LLM behavior

- [ ] **Step 1: Update docs**

Remove P0 image multimodal item from `docs/TODO.md` and update architecture/dev docs to say image attachments are persisted as STUBs but expanded to multimodal content only inside the LLM adapter path.

- [ ] **Step 2: Run full TypeScript tests**

Run: `bash ./scripts/test.sh`

Expected: `success`, all Vitest files pass.

- [ ] **Step 3: Run Swift gates**

Run:

```bash
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: both `success`.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/core/src/runtime/AgentMessage.ts packages/core/src/llm/LLMClient.ts packages/core/src/llm/VercelAdapters.ts packages/core/src/llm/VercelClient.ts packages/core/src/logging/createLoggingFetch.ts packages/core/tests/runtime/agent-runtime.test.ts packages/core/tests/llm/vercel-client.test.ts packages/core/tests/logging/logging-fetch.test.ts apps/agent-server/src/MessageTranslator.ts apps/agent-server/src/SessionRuntimeOrchestrator.ts apps/agent-server/src/MessageTranslator.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts docs/TODO.md docs/architecture-review.md docs/dev.md docs/superpowers/plans/2026-05-19-image-multimodal.md
git commit -m "feat: send image attachments to multimodal llm"
```

---

## Self-Review

- Spec coverage: covers typed multimodal content, user-provided image boundary, blob dereference tests, fake runtime propagation, and network log redaction.
- Placeholder scan: no TBD / TODO placeholders remain.
- Type consistency: `AgentUserContent`, `LLMCompleteOptions`, `blobStore`, and `agentMessagesToRuntimeMessages` are named consistently across tasks.
