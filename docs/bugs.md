# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-22。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复完成后从当前文档中删除，并写入manual-qa文档中

##  测试备注

### mock-llm 不能证明真实 vision；真实 provider token streaming 已单独验证

- 2026-05-19 本轮实机 QA 使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。
- 图片附件链路可验证到 Quick Look、SessionWindow 摘要、blob stub 持久化；但 `[mock:image-summary]` 只返回固定文本，不能证明真实 LLM 基于图片内容描述。
- 2026-05-20 已补充 `MockLLMClient.stream()`；`[mock:assistant-ok]` 可验证 mock 模式下 agent-server 到 desktop 的多段 `assistant_message_delta` 渲染链路。
- mock delta 是本地确定性分片，不能证明真实 provider 的网络 streaming 或 token 到达节奏；该项已在 2026-05-21 使用非 mock App 与真实 `text/event-stream` 响应完成单独验证。
- 2026-05-21 直接向 agent-server 发送 PNG 附件的真实 provider 会话 `~/.spotAgent/sessions/session-1779350388296-2gmta1.json` 已证明 image STUB 会展开为多模态请求，provider 可读出图片 token `VISION_PASS_20260521`。
- 2026-05-21 PromptPanel 区域截图 UI 重试已证明 image chip、session image STUB 与真实多模态 provider 请求链路会打通；用户同日手动确认重新授予当前打包 App 权限后，区域圈选路径可正常工作。
- 结论：真实 provider token streaming、真实 vision 底层请求与区域截图附件路径均已归档到 [archive.md](./archive.md)；后续权限异常按当前 bug「重新打包后的 HandAgent 会被 macOS 视为不同 App」追踪。

### `System Events click at` 不适合作为状态气泡点击的唯一证据

- 2026-05-20 状态气泡焦点回跳 QA 中，状态气泡窗口是 `.nonactivatingPanel`，Computer Use 的 accessibility tree 只暴露当前 key SessionWindow，未把状态气泡作为可点击元素枚举出来。
- 使用 `System Events` 的 `click at {x, y}` 点击状态气泡坐标后，AX 主窗口 / 焦点窗口未稳定切换；改用 CoreGraphics `CGEvent` 发送鼠标 down/up 后，状态气泡点击可稳定触发焦点回跳。
- 结论：验证状态气泡这类 non-activating panel 的真实点击时，应以 Computer Use 前后 UI 状态 + AX 状态为观察证据，实际点击输入优先使用 CGEvent；不要把 `System Events click at` 的失败单独判为产品 bug。

---

## 当前 bug

### 删除运行中的会话时，若 active run 不响应 abort，delete_session_request 可能无限等待

- **严重级别**：P1
- **发现日期**：2026-05-22
- **发现方式**：主链路可靠性代码审计。
- **复现步骤**：
  1. 构造一个运行中的 session，使 `SessionRuntimeOrchestrator.handleUserMessage` 内部的 `runtime.runWithMessages` 返回永不 resolve / reject 的 Promise，或让 LLM/tool 调用忽略 `AbortSignal`。
  2. 对同一 session 发送 `delete_session_request`。
  3. 观察 `SessionRouter.handleDeleteSession` 在删除前调用 `await interruptAndWait(...)`。
- **实际结果**：`SessionRuntimeOrchestrator.interruptAndWait` 只循环等待 `activeRuns.has(sessionId)` 变为 false；`activeRuns` 只在 `handleUserMessage` 的 `finally` 中清理。如果 runtime promise 永不 settle，`finally` 不执行，删除请求不返回 `delete_session_response`，SessionWindow 也不会关闭 tab 或刷新历史。
- **期望结果**：删除 running session 时应有超时或强制清理边界；即使 LLM/tool 不响应 abort，server 也应在有限时间内返回明确的删除结果，并避免旧 run 晚到结果污染已删除 session。
- **证据**：`apps/agent-server/src/SessionRouter.ts` 的 `delete_session_request` 分支在删除前等待 `interruptAndWait`；`apps/agent-server/src/SessionRuntimeOrchestrator.ts` 的 `interruptAndWait` 当前无超时轮询 `activeRuns`；`activeRuns` 清理依赖 `handleUserMessage` 的 `finally`。core runtime 的 LLM stream、legacy complete 或 tool call 如果不响应 abort，都可能让 runtime promise 不 settle。
- **初步调用链 / 根因边界**：SessionWindow 删除历史项 → `delete_session_request` → `SessionRouter.handleDeleteSession` → `SessionRuntimeOrchestrator.interruptAndWait` → `AbortController.abort()` → runtime/LLM/tool 未结束 → `activeRuns` 不清理 → router 无响应 → UI 等不到删除结果。
- **清理状态**：发现时未启动 HandAgentDesktop；`pgrep -fl HandAgentDesktop` 与 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 均无输出。

### FileSessionStore 同一 session 并发写入可能丢失 messages 或 events

- **严重级别**：P1
- **发现日期**：2026-05-22
- **发现方式**：主链路可靠性代码审计。
- **复现步骤**：
  1. 使用 `FileSessionStore` 创建同一个 session。
  2. 并发触发两次同 session 的写操作，例如两个 `appendMessages`，或 `appendEvents` 与 `setMessages` 交错。
  3. 让两个写操作都基于同一份旧 JSON 快照完成 read-modify-write。
- **实际结果**：`FileSessionStore.appendMessages`、`setMessages`、`appendEvents` 都是无锁 read-modify-write，最后通过整文件覆盖写回。并发写同一 session 文件时，后写者可能覆盖先写者，导致 user message、assistant/tool message、tool audit event 或 error event 丢失。
- **期望结果**：同一 session 的文件写入应串行化，至少保证同 session 的 `create / delete / updateTitle / appendMessages / setMessages / appendEvents` 不会互相覆盖；不同 session 不应被全局锁无谓阻塞。
- **证据**：`packages/core/src/storage/FileSessionStore.ts` 的 `appendMessages`、`setMessages`、`appendEvents` 均先 `get()` 再修改内存对象，最后 `write()` 整文件。agent-server 的 WebSocket message handler 没有 per-session 队列；同一 session 多个 `user_message` 可并发进入 `SessionRuntimeOrchestrator.handleUserMessage`，每轮开始会调用 `SessionPersistence.persistUserMessage`，完成时还会 `persistRunResult` 写 messages/events。
- **初步调用链 / 根因边界**：PromptPanel/SessionWindow 快速发送或重连恢复 → agent-server 并发处理同 session 消息 → `SessionPersistence` 调 `FileSessionStore` 多个 RMW 写操作 → 后写覆盖先写 → 持久化历史与 tool 审计不可信。
- **清理状态**：发现时未启动 HandAgentDesktop；`pgrep -fl HandAgentDesktop` 与 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 均无输出。
