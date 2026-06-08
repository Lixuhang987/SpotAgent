# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)

最后核对日期：2026-06-09。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复完成后从当前文档中删除，并写入manual-qa文档中

##  测试备注

### mock-llm 不能证明真实 vision；真实 provider token streaming 已单独验证

- 2026-05-19 本轮实机 QA 使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。
- 图片附件链路可验证到 Quick Look、ThreadWindow 摘要、blob stub 持久化；早期 QA 记录中的 `SessionWindow` 是历史旧称。但 `[mock:image-summary]` 只返回固定文本，不能证明真实 LLM 基于图片内容描述。
- 2026-05-20 已补充 `MockLLMClient.stream()`；`[mock:assistant-ok]` 可验证 mock 模式下 agent-server 到 desktop 的多段 `assistant_message_delta` 渲染链路。
- mock delta 是本地确定性分片，不能证明真实 provider 的网络 streaming 或 token 到达节奏；该项已在 2026-05-21 使用非 mock App 与真实 `text/event-stream` 响应完成单独验证。
- 2026-05-21 直接向 agent-server 发送 PNG 附件的真实 provider thread 已证明 image STUB 会展开为多模态请求，provider 可读出图片 token `VISION_PASS_20260521`。该条历史证据原始文件位于旧目录 `~/.spotAgent/sessions/session-1779350388296-2gmta1.json`；当前持久化目录为 `~/.spotAgent/threads/`。
- 2026-05-21 PromptPanel 区域截图 UI 重试已证明 image chip、session image STUB 与真实多模态 provider 请求链路会打通；用户同日手动确认重新授予当前打包 App 权限后，区域圈选路径可正常工作。
- 结论：真实 provider token streaming、真实 vision 底层请求与区域截图附件路径均已归档到 [archive.md](./archive.md)。后续同类问题应按当前实现重新复现，不沿用旧 `sessions/` 证据作为当前 bug 依据。

### `System Events click at` 不适合作为状态气泡点击的唯一证据

- 2026-05-20 状态气泡焦点回跳 QA 中，状态气泡窗口是 `.nonactivatingPanel`，Computer Use 的 accessibility tree 只暴露当前 key ThreadWindow。早期 QA 记录中的 `SessionWindow` 是历史旧称，当前不再作为术语使用。
- 使用 `System Events` 的 `click at {x, y}` 点击状态气泡坐标后，AX 主窗口 / 焦点窗口未稳定切换；改用 CoreGraphics `CGEvent` 发送鼠标 down/up 后，状态气泡点击可稳定触发焦点回跳。
- 结论：验证状态气泡这类 non-activating panel 的真实点击时，应以 Computer Use 前后 UI 状态 + AX 状态为观察证据，实际点击输入优先使用 CGEvent；不要把 `System Events click at` 的失败单独判为产品 bug。

---

## 当前 bug

### Electron supervisor description 启动日志不可见

- **严重级别**：P2
- **发现日期**：2026-06-09
- **复现步骤**：
  1. 在 `main` 的 `/Users/mu9/proj/handAgent` 确认工作区干净且 `127.0.0.1:4317` 无监听。
  1. 使用 `HANDAGENT_ELECTRON_SHELL=1` 与 `HANDAGENT_ELECTRON_BINARY=/Users/mu9/proj/handAgent/node_modules/.pnpm/electron@42.3.3/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` 启动 `dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop`，并把 app stdout/stderr 重定向到 `/tmp/handagent-qa/electron-log-description-20260609.log`。
  1. 等待 Electron flag 路径启动完成。
  1. 检查 app stdout/stderr、macOS unified log 和 `/tmp/handagent-qa/*.log`。
- **实际结果**：Swift 宿主、Electron main、agent-server 均启动成功，`127.0.0.1:4317` 由 `node --experimental-transform-types ... apps/agent-server/src/server/server.ts` 监听，`/api/activity` 返回 idle snapshot；但 `/tmp/handagent-qa/electron-log-description-20260609.log` 为 0 行，`log show --last 3m --predicate 'process == "HandAgentDesktop" OR process == "Electron"'` 和 `/tmp/handagent-qa/*.log` 均找不到 `agent-server supervisor`、`coreRuntimeHost` 或 `utilityProcessBlocker`。
- **期望结果**：Electron flag 启动日志应包含 agent-server supervisor description，并明确 `mode`、`coreRuntimeHost: "agent-server"` 与 `utilityProcessBlocker`；如果走 Node child fallback，应说明 utilityProcess blocker，满足 `docs/manual-qa.md` 的 Electron UI Shell 最终态验收项。
- **证据**：启动日志文件 `/tmp/handagent-qa/electron-log-description-20260609.log` 为 0 行；进程证据显示 `HandAgentDesktop`、Electron main、agent-server 与 renderer 均存在；`lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 node 监听；`/api/activity` 返回 `{"type":"activity.snapshot","status":"idle"}`。
- **初步调用链 / 根因边界**：预期链路是 `Electron main bootElectronShell -> process.stderr.write("[electron-shell] agent-server supervisor: ...") -> Swift ElectronShellProcess stderr pipe -> 可观察启动日志或统一日志`。当前代码中 `ElectronShellProcess` 为 Electron 子进程设置 `standardError = Pipe()`，但 stderr readability handler 只读取并丢弃非空 data；失败边界疑似在 Swift 侧 stderr 转发/记录，而不是 Electron main 是否构造 description 或 agent-server 是否启动。

### Electron StatusBubble 无可聚焦 ThreadWindow 时未打开 PromptPanel

- **严重级别**：P1
- **发现日期**：2026-06-09
- **复现步骤**：
  1. 在 `main` 的 `/Users/mu9/proj/handAgent` 执行 `bash ./scripts/package-app.sh --mock-llm`。
  1. 使用 `HANDAGENT_ELECTRON_SHELL=1` 与 `HANDAGENT_ELECTRON_BINARY=/Users/mu9/proj/handAgent/node_modules/.pnpm/electron@42.3.3/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` 启动 `dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop`。
  1. 提交 `ELECTRON_STARTING_SEQUENCE_QA_20260609_C [mock:assistant-ok]`，确认 Electron `HandAgent ThreadWindow` 与 `HandAgent Activity` 均可见。
  1. 点击 Electron `HandAgent ThreadWindow` 关闭按钮，确认只剩 `HandAgent Activity`，且 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 仍显示 agent-server 监听。
  1. 使用 CGEvent 点击 ActivityWindow 中心坐标 `{x: 1280, y: 870}`，重复两次。
- **实际结果**：点击后前台进程为 Electron，但只有 `HandAgent Activity` 窗口，`HandAgentDesktop` 没有可见 `PromptPanel`。截图为 `/tmp/handagent-qa/electron-bubble-after-threadwindow-close-click.png` 与 `/tmp/handagent-qa/electron-bubble-no-threadwindow-second-click.png`。
- **期望结果**：当 Electron StatusBubble 无可聚焦 ThreadWindow 时，应通过 `prompt_panel.show_requested` 请求 Swift 打开 `PromptPanel`，让用户能从状态气泡回到输入入口。
- **证据**：同一 QA run 中，ThreadWindow 可见时点击 ActivityWindow 已证明 StatusBubble 点击链路可触发聚焦：前台切到 Electron，`HandAgent ThreadWindow` 的 `AXMain=true`，`HandAgent Activity` 的 `AXMain=false`。关闭 ThreadWindow 后，`osascript` 只返回 Electron `HandAgent Activity`，HandAgentDesktop 无窗口；`lsof` 确认 `node` 仍监听 `127.0.0.1:4317`。Thread 文件 `~/.spotAgent/threads/thread-1780947483869-t8ou50.json` 包含 prompt 与 mock assistant，说明失败不是 agent-server 不可用。
- **初步调用链 / 根因边界**：预期链路是 `ActivityWindow renderer click -> activity-window:focus-thread IPC -> ElectronShellRuntime.handleActivityWindowFocusRequest(activeThreadId) -> ThreadWindowPrewarmer.focus() 返回 false -> prompt_panel.show_requested -> ElectronBackedAppServer.onPromptPanelShowRequested -> AppCoordinator.promptPanelController.show()`。当前已验证点击命中 ActivityWindow，且可见 ThreadWindow 分支能聚焦；失败边界在“无可见 ThreadWindow 时发送或处理 `prompt_panel.show_requested`”这一段，需用 `$trace-and-verify-call-chain` 继续定位。

### `AI SDK stream finished without assistant content or tool calls`

- **严重级别**：P1
- **发现日期**：2026-05-24
- **复现步骤**：
  1. 以真实 LLM 模式启动 `HandAgentDesktop`。
  1. 提交 `Please inspect my current screen with tools and summarize what you see. HANDAGENT_LAZY_TOOL_QA_20260524`。
  1. 在 `screen.capture` / `accessibility.snapshot` 授权弹窗中先经历一次拒绝，再点 `始终允许` 重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`。
- **实际结果**：ThreadWindow 先显示 `use_tools`、`window.list`、`screen.capture` 等工具结果，但最终出现红色警告 `AI SDK stream finished without assistant content or tool calls.`，没有产出最终 assistant 总结。
- **期望结果**：工具执行完成后，流应正常收尾并输出 assistant 总结，thread 里应有可见 assistant 内容而不是空流错误。
- **证据**：这条 2026-05-24 历史证据原始文件位于旧目录 `~/.spotAgent/sessions/session-1779601103378-sa0wyo.json`，当前同类证据应查看 `~/.spotAgent/threads/<threadId>.json`。该历史记录包含初始 `use_tools`、`app.frontmost`、`screen.capture`、`accessibility.snapshot` 以及 `error` 事件 `AI SDK stream finished without assistant content or tool calls.`；`~/.spotAgent/log/2026-05-24/network-001.jsonl` 可见对应 `screen.capture` / `accessibility.snapshot` 请求与返回。UI 中也直接显示同名告警。进一步复查同一网络日志可见，第二轮 retry 后模型再次调用 `use_tools`，runtime 回灌 `Tools are already active.`，随后对 provider 的下一次 `responses` 请求返回 HTTP 200 streaming，但没有 assistant 文本或 tool call。
- **初步调用链 / 根因边界**：`ThreadScopedToolRegistry.refreshActivated()` 激活后仍把 `use_tools` 暴露给 provider，允许模型在已激活 thread 中重复调用 no-op meta-tool；这与 `docs/manual-qa.md` 场景 3 “同一 thread 激活后不再重复出现 use_tools，模型直接调用真实工具”的验收目标冲突。失败边界位于 thread-scoped tool registry 的激活后工具表，而不是 desktop 渲染、权限回灌或持久化层。
