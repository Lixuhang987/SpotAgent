# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)

最后核对日期：2026-06-06。

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

### Anthropic AI SDK provider 错误流被落成空 assistant

- **严重级别**：P1
- **发现日期**：2026-06-06
- **复现步骤**：
  1. 将 `~/.spotAgent/settings.json` 配置为 `llm.provider = "anthropic"`、`llm.api = "chat"`、`llm.baseUrl = "https://anyrouter.top/v1"`、`llm.model = "claude-3-5-haiku-20241022"`，并通过 `ANTHROPIC_AUTH_TOKEN` 提供 Bearer token。
  1. 使用真实模式打包启动 `HandAgentDesktop`，确认 bundle 内没有 `HandAgentRuntimeMode.json`。
  1. 提交普通文本 prompt：`Use plain text only. Reply exactly: ANTHROPIC_QA_TEXT_20260606`。
  1. 直接用 `createLLMClient({ provider: "anthropic", ... })` 调同一 Anthropic-compatible endpoint 复现 provider stream。
- **实际结果**：SessionWindow 最终回到 idle，但没有 assistant 文本，也没有错误 banner；session 文件落了一条 `content: ""` 的 assistant message，`events: []`。直接 Node 调用时 AI SDK 把 TLS handshake failure 写到 stderr，但 `AISDKStreamingClient.stream()` 仍产出空 `message_end`。
- **期望结果**：provider 报错或流结束但没有 assistant content / tool call 时，`LLMClient.stream()` 应抛出明确错误，让 runtime 写入 `session_error` / `error` event 并在 UI 显示失败，而不是持久化空 assistant。
- **证据**：
  - `~/.spotAgent/sessions/session-1780746486889-66y697.json` 记录 user message 后紧跟 `{"role":"assistant","content":""}`，`events: []`。
  - `curl ${ANTHROPIC_BASE_URL}/v1/models` 使用 `Authorization: Bearer ${ANTHROPIC_AUTH_TOKEN}` 返回 HTTP 200，说明 token 与模型列表可用；同一网关用 `x-api-key` 返回 HTTP 401，符合当前 Bearer token 配置。
  - 直接 Node 调用 `LLMClientFactory.createLLMClient()` 的 Anthropic stream 时，stderr 出现 `RetryError` / `TLS handshake failure`，但归一化输出只有 `{"type":"message_end","message":{"role":"assistant","content":""},"toolCalls":[]}`。
  - `packages/core/src/llm/VercelClient.ts` 已有 provider error 与空流保护；`packages/core/src/llm/LLMClientFactory.ts` 的 `AISDKStreamingClient.stream()` 目前只处理 `text-delta` / `tool-call`，循环结束后无条件 yield `message_end`。
- **初步调用链 / 根因边界**：`SettingsBackedLLMClient` 已能构造 Anthropic provider，失败边界位于 `AISDKStreamingClient.stream()` 对 AI SDK `fullStream` 的归一化：未处理 error part，也未在 content 与 toolCalls 都为空时抛错。
- **基线与清理状态**：发现前 main 已通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`；发现后 `HandAgentDesktop` PID `56979` 与 agent-server PID `56986` 仍保持真实 QA 现场，4317 由 `node` 监听。

### `AI SDK stream finished without assistant content or tool calls`

- **严重级别**：P1
- **发现日期**：2026-05-24
- **复现步骤**：
  1. 以真实 LLM 模式启动 `HandAgentDesktop`。
  1. 提交 `Please inspect my current screen with tools and summarize what you see. HANDAGENT_LAZY_TOOL_QA_20260524`。
  1. 在 `screen.capture` / `accessibility.snapshot` 授权弹窗中先经历一次拒绝，再点 `始终允许` 重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`。
- **实际结果**：SessionWindow 先显示 `use_tools`、`window.list`、`screen.capture` 等工具结果，但最终出现红色警告 `AI SDK stream finished without assistant content or tool calls.`，没有产出最终 assistant 总结。
- **期望结果**：工具执行完成后，流应正常收尾并输出 assistant 总结，session 里应有可见 assistant 内容而不是空流错误。
- **证据**：`~/.spotAgent/sessions/session-1779601103378-sa0wyo.json` 记录了初始 `use_tools`、`app.frontmost`、`screen.capture`、`accessibility.snapshot` 以及 `error` 事件 `AI SDK stream finished without assistant content or tool calls.`；`~/.spotAgent/log/2026-05-24/network-001.jsonl` 可见对应 `screen.capture` / `accessibility.snapshot` 请求与返回。UI 中也直接显示同名告警。
- **初步调用链 / 根因边界**：问题出现在真实 provider 工具结果回灌后的流式收束阶段；需在修复 Anthropic 空 assistant 后继续复验，确认是否为同一类空流处理缺口或另一个 runtime/provider 收尾问题。
