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

### runtime 错误会话从历史恢复后被误判为 agent-server 重启中断

- **严重级别**：P2
- **发现日期**：2026-05-22
- **发现方式**：mock LLM 主链路 live QA + 只读代码审计。
- **复现步骤**：
  1. 在 mock LLM App 中通过 PromptPanel 提交 `[mock:unknown-tool] QA_UNKNOWN_TOOL_MAIN_CHAIN_20260522_053214`。
  2. 确认当前 SessionWindow 实时显示 `Unknown tool: mock.missing_tool`。
  3. 关闭该 tab，但不删除历史文件。
  4. 从左侧历史列表重新打开同一 session。
- **实际结果**：实时窗口第一次显示正确的 `Unknown tool: mock.missing_tool`；从历史恢复后，UI 消息区和底部错误条变成 `本轮运行因 agent-server 重启而中断，请重新发送请求。`。session 文件也追加了一条 assistant `run_lost_after_restart` 消息和同 code 的 error event，原始 unknown-tool 错误只剩旧 event。
- **期望结果**：已知 runtime 错误会话从历史恢复时应保留原始错误原因，例如 `Unknown tool: mock.missing_tool`，不应被恢复逻辑误改成 agent-server 重启中断。
- **证据**：live QA session `/Users/mu9/.spotAgent/sessions/session-1779399206144-ah4pi8.json`。首次运行后 UI 显示 `Unknown tool: mock.missing_tool`，文件包含 user message 与 `{ type: "error", message: "Unknown tool: mock.missing_tool" }`。重新打开历史后，文件变为 2 条 messages，第二条 assistant 为 `本轮运行因 agent-server 重启而中断，请重新发送请求。`，events 追加 `{ type: "error", code: "run_lost_after_restart" }`。QA 清理时 `pgrep -fl HandAgentDesktop` 与 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 均无输出。
- **初步调用链 / 根因边界**：PromptPanel → SessionWindow → agent-server → `MockLLMClient` 返回 `mock.missing_tool` → `AgentRuntime` 在 `ToolRegistry.get` 失败后抛错 → `SessionRuntimeOrchestrator` 实时推 `error` 并只落 error event，不写 assistant 错误 message → 关闭 tab 后重新 `open_session` → `SessionPersistence.recoverIncompleteTurnForSnapshot` 只看到最后一条 persisted message 仍是 user，且最后错误不是 `run_interrupted`，于是追加 `run_lost_after_restart`，覆盖用户可见错误原因。
