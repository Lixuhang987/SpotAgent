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

### 运行中的会话遇到 agent-server 子进程退出后，UI 显示连接错误且持久化没有中断记录

- **严重级别**：P1
- **发现日期**：2026-05-22
- **复现步骤**：
  1. 在 `/Users/mu9/proj/handAgent` 的 `main` 分支运行基线：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过。
  2. 使用 `bash ./scripts/package-app.sh --mock-llm` 打包并 `open dist/HandAgentDesktop.app` 启动 mock App。
  3. 通过原生 `⌘⇧Space` 唤起 PromptPanel，提交 `[mock:slow-focus] QA_RUNNING_SERVER_CRASH_20260522_0355`。
  4. Computer Use 确认 SessionWindow 当前 tab 进入运行态，composer 右侧显示 `停止` 按钮。
  5. 查询 4317 监听进程为 `node 77697`，执行 `kill -TERM 77697`，保留 HandAgentDesktop 运行。
  6. 等待约 2 秒后确认 agent-server 自动重启为 `node 79272`，父进程仍是 HandAgentDesktop。
- **实际结果**：当前 tab 显示用户 prompt 后追加 `Could not connect to the server.`，底部错误条同样显示 `Could not connect to the server.`；composer 回到可发送状态。对应 session 文件 `/Users/mu9/.spotAgent/sessions/session-1779393340152-tycszb.json` 只有 1 条 user message，`events` 为空，没有 `interrupted`、`error` 或可恢复提示的持久化记录。
- **期望结果**：运行中的会话因 agent-server 子进程退出而丢失当前 run 时，UI 应明确进入可理解的中断/失败状态，文案应说明本轮运行因 agent-server 重启中断；持久化中应记录 error 或 interrupted 事件，避免历史恢复时只剩用户消息且丢失失败原因。
- **证据**：重启后 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 `node 79272` 监听；`ps -o pid,ppid,command -p 79272` 显示父进程为 `77112 /Users/mu9/proj/handAgent/dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop`。Computer Use 观察到消息区与错误条文本均为 `Could not connect to the server.`。session 文件 `session-1779393340152-tycszb.json` 的 `metadata.messageCount` 为 `1`，`messages[0].content` 为 `[mock:slow-focus] QA_RUNNING_SERVER_CRASH_20260522_0355`，`events` 为 `[]`。
- **初步调用链 / 根因边界**：PromptPanel 提交和运行态 UI 已验证；agent-server 子进程退出后桌面进程自动重启也已验证。失败边界在运行中 socket 断开到 tab 恢复之间：旧 socket close 会中断 server 内存中的 active run，但子进程退出导致该中断状态无法落盘；新 server 只能从 session 文件返回 snapshot，当前 UI 最终保留通用连接错误，未把“运行因 server 重启中断”转成一致的 UI 与持久化状态。
- **清理状态**：本轮 live QA 结束后已正常退出 HandAgentDesktop；`pgrep -fl HandAgentDesktop` 与 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 均无输出。
