# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)

最后核对日期：2026-05-24。

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

### mock file-write 回归返回 Unknown tool

- 严重级别：P1。
- 发现日期：2026-05-24。
- 复现步骤：
  1. 在 `/Users/mu9/proj/handAgent` 的 `main` 分支执行基线：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，三项均通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并打开 `dist/HandAgentDesktop.app`。
  3. 通过默认全局快捷键 `⌘⇧Space` 打开 PromptPanel，提交 `please [mock:file-write] QA_AGENTCORE_MESSAGES_ONLY_20260524_025249`。
- 实际结果：SessionWindow 显示 `Unknown tool: file.write`，底部状态也显示同一错误；未出现 `file.write` tool 气泡，也没有最终 assistant 文案。
- 期望结果：SessionWindow 应按协议事件显示 user、tool、assistant 消息气泡，最终 assistant 文案应为 `Mock file.write completed for hello.txt.`。
- 证据：
  - UI：Computer Use 观察到 SessionWindow 消息区文本为 `please [mock:file-write] QA_AGENTCORE_MESSAGES_ONLY_20260524_025249 Unknown tool: file.write`，错误状态为 `Unknown tool: file.write`。
  - mock 模式：`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 内容为 `{"llmMode":"mock"}`。
  - 进程：`HandAgentDesktop` pid `3000`；`node` pid `3045` 监听 `*:4317`。
  - 持久化：`~/.spotAgent/sessions/session-1779562389146-q7j355.json` 只有 1 条 user message，`events` 中记录 `{ "type": "error", "message": "Unknown tool: file.write" }`。
- 初步调用链 / 根因边界：PromptPanel 提交、SessionWindow 打开、agent-server 持久化均已到达；失败发生在 mock LLM 产生 `file.write` tool call 后，runtime/tool registry 查找阶段未找到 `file.write`。需检查 mock client 的 tool name 与当前注册工具名称是否漂移，或 mock 打包模式下内置工具注册是否被 settings 过滤。
