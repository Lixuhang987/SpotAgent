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

### 权限审批等待期间 SessionWindow 提前退出 running 状态

- **严重级别**：P2
- **发现日期**：2026-05-22
- **发现方式**：mock LLM 主链路 live QA + 调用链代码审计。
- **复现步骤**：
  1. 在 main 分支通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 基线。
  2. 使用 `bash ./scripts/package-app.sh --mock-llm` 打包并启动 `dist/HandAgentDesktop.app`。
  3. 通过原生全局快捷键打开 PromptPanel，提交 `[mock:workspace-ask] QA_WORKSPACE_ASK_STATUS_20260522_055945`。
  4. 等 SessionWindow 出现 `授权调用 workspace.askUser` 权限审批面板。
- **实际结果**：SessionWindow 正在等待权限审批时，底部 composer 显示普通发送箭头且发送按钮禁用，没有显示 Stop 按钮；用户看不到该会话仍在等待中的运行态，也无法从 UI 中断本轮运行。未处理权限请求约 60 秒后，session 文件自动记录 deny / timeout，并继续走 tool error 结果。
- **期望结果**：权限审批、workspace 选择或其他 tool 等待期间，当前 tab 应继续保持 running 用户反馈；底部 composer 应显示 Stop，状态聚合也应能把该会话视为运行中，直到用户决策、tool result、错误或中断事件结束本轮。
- **证据**：
  - Computer Use UI：会话窗口可见 `授权调用 workspace.askUser`，参数包含 `candidateIds: ["qa-workspace", "tmp"]` 与 prompt `请选择 QA 要写入的 workspace`；同一时刻底部控件是 disabled `arrow.up` 发送按钮，不是 `stop.fill` 停止按钮。
  - 会话文件 `/Users/mu9/.spotAgent/sessions/session-1779400878497-b745wh.json`：约 60 秒后写入 `{ type: "permission_request", toolName: "workspace.askUser", action: "deny", granted: false }` 与 `{ type: "tool_result", status: "error", output: "用户拒绝执行该 tool" }`，说明该轮确实停在权限请求等待边界后超时。
  - 代码边界：`AgentRuntime.completeTurn` 在收集到 tool call 后发送 `assistant_message_end` 且 payload status 为 `completed`；`SessionTabViewModel.handle(.assistantMessageEnd)` 直接把 status 归一化为 idle；后续 `.permissionRequest` 只追加请求面板，没有把 tab 状态保持或恢复为 running。
- **初步调用链 / 根因边界**：PromptPanel → SessionWindow → agent-server → `MockLLMClient` 返回 `workspace.askUser` tool call → `AgentRuntime.completeTurn` 先推 `assistant_message_end(completed)` → Swift `SessionTabViewModel` 把 tab 状态置为 idle → `SessionPermissionBridge` 推 `permission_request` → UI 展示审批面板但 composer 不再显示 Stop → 请求 60 秒超时后落 deny / tool_result。
- **QA 清理状态**：发现缺陷后停止继续 QA，准备退出 mock App 并在独立 worktree 中修复。
