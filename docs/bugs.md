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

### `MockLLMClient` 在同一 session 中会被历史 mock trigger 截走后续场景

- **严重级别**：P2
- **发现日期**：2026-06-06
- **基线结果**：`bash ./scripts/test.sh` 通过；`bash ./scripts/swiftw test` 通过；`bash ./scripts/swiftw build` 通过；`bash ./scripts/package-app.sh --mock-llm` 通过。
- **复现步骤**：
  1. 在 `/Users/mu9/proj/handAgent` 的 `main` 分支打包并启动 mock LLM App：`bash ./scripts/package-app.sh --mock-llm`、`open dist/HandAgentDesktop.app`。
  1. 用原生快捷键事件 `osascript -e 'tell application "System Events" to key code 49 using {command down, shift down}'` 打开 PromptPanel。
  1. 新建 session，提交 `QA smoke [mock:assistant-ok] 2026-06-06`。
  1. 在同一 session 的 composer 中继续提交 `QA workspace ask [mock:workspace-ask] 2026-06-06`。
- **实际结果**：第二轮没有触发 `workspace.askUser`，SessionWindow 未出现 workspace 选择气泡；session 文件追加的仍是 `Mock assistant response: main chain is reachable.`。
- **期望结果**：第二轮应按最新用户输入中的 `[mock:workspace-ask]` 触发 `workspace.askUser`，并把 `workspace_ask` 只回到当前 session 对应 tab。
- **证据**：`~/.spotAgent/sessions/session-1780739178062-ysugm5.json` 中先记录 user `QA smoke [mock:assistant-ok] 2026-06-06` 与 assistant `Mock assistant response: main chain is reachable.`，随后第二轮 user `QA workspace ask [mock:workspace-ask] 2026-06-06` 后仍记录 assistant `Mock assistant response: main chain is reachable.`，`events` 仍为空；Computer Use 观察到 SessionWindow 未出现 workspace 选择气泡。
- **初步调用链 / 根因边界**：`MockLLMClient.findScenario()` 通过 `userMessageTexts(messages)` 扫描整个会话历史，并按 `mockLLMScenarios` 列表顺序返回第一个匹配场景；因为 `[mock:assistant-ok]` 位于场景列表前面，后续同 session 中的 `[mock:workspace-ask]` 被历史首轮输入截走。问题边界在 mock LLM 场景选择逻辑，不是 PromptPanel、SessionWindow、agent-server 入口或持久化链路。
- **清理状态**：QA 后已退出 `HandAgentDesktop`，`lsof -nP -iTCP:4317` 确认无监听进程残留。

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
- **初步调用链 / 根因边界**：问题出现在 `LLMClient` 流式收尾到 session 持久化之间的收束阶段，暂不确定是模型空收尾、AI SDK 处理空结尾，还是 runtime 对工具结果后的 assistant 完成信号处理有缺口。
