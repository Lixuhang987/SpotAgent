# 手工验收清单

## 维护规则

本文件只保留尚未通过实机 QA 的手工验收项。验证通过后，必须从本文件删除对应内容，并把完整验证日期、环境、过程、证据与结论移动到 [archive.md](./archive.md)(永远不要读取archive.md的内容，仅在最后追加)。

## 验收目标

确认桌面 Agent MVP 仍未归档的端到端路径可用，并把新通过的条目及时移入归档：ScreenCaptureKit 反向 IPC、Accessibility、多 provider LLM。

## 验收前提

- 已完成依赖安装。
- 已通过 `bash ./scripts/test.sh`。
- 已通过 `bash ./scripts/swiftw test`。
- 已通过 `bash ./scripts/swiftw build`。

## ScreenCaptureKit 反向 IPC（P2）

1. 让 LLM 调 `screen.capture(target: "display")`，确认返回当前显示器截图（base64 图片可解码）。
1. 让 LLM 调 `screen.capture(target: "window", windowId: <frontmost>)`，确认返回指定窗口截图。
1. 快速连续发送 3 个 `platform_request`，确认通过 `requestId` 隔离，结果不串。

最近阻塞记录：2026-05-21 使用 mock-LLM 触发 `[mock:screen-display]` 已验证到 `screen.capture` 权限气泡与真实 PlatformBridge 调用；代码侧已改为先在 packaged app 进程内执行 `CGPreflightScreenCaptureAccess()` / `CGRequestScreenCaptureAccess()`，并在预检通过但 `SCShareableContent` 仍失败时返回 `capture_failed` 与 `preflight/domain/code/message`，不再把所有枚举失败都冒充为用户拒绝。当前仍未做实机通过归档，因为本机 `kTCCServiceScreenCapture` 记录与当前打包 app 的签名身份不匹配；重置并重新授予屏幕录制权限属于 macOS 隐私状态变更，需用户明确同意后才能执行。获得授权后需重新验证 display/window 截图和 3 个快速 `platform_request` 隔离。

## Accessibility 平台能力（P2）

1. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent。
1. 打开 TextEdit、系统设置或 Finder 作为前台 App，让 LLM 调用 `accessibility.snapshot({kind: "frontmost_app"})`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
1. 选择一个快照中的按钮或文本框，用对应 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
1. 用 `window.list` 取得窗口 id 后调用 `accessibility.snapshot({kind: "window", windowId: <id>})`，确认返回的是指定窗口的树；再传入同一 App 下不存在或不匹配的 `windowId`，确认返回 `not_found`，不会退回 focused window。
1. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

最近阻塞记录：2026-05-21 已用 mock-LLM 验证 OCR 正向与缺参错误路径，并归档到 [archive.md](./archive.md)。同日保持 TextEdit 前台，通过 agent-server WebSocket 触发 `[mock:accessibility-frontmost]` 与 `[mock:accessibility-set-frontmost]`，两者都经过真实 PlatformBridge 到达桌面 provider，但当前 packaged app 没有辅助功能权限，session `~/.spotAgent/sessions/session-1779352892449-iyjcj0.json` 与 `~/.spotAgent/sessions/session-1779352937653-pt4c60.json` 均记录 `tool_result.status: error`，输出为 `HandAgent 没有辅助功能权限。请打开「系统设置 → 隐私与安全性 → 辅助功能」，允许 HandAgent 后重试。`。未获用户明确授权前，不重置或修改 macOS 隐私权限；获得权限后需回归 frontmost snapshot、element action、window target 与 `not_found` 边界。

## 多 provider LLM（P2）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`，当前 UI 与 `~/.spotAgent/settings.json` 均为 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.3-codex"`、`baseUrl: "https://lpgpt.us/v1"`，API key 已配置但不展示。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。

## 修复 bug （待实际qa验证修复）

### 3. 状态气泡不会随 SessionWindow 失败状态更新

**严重级别**：P1

**现象**：会话窗口显示 `failed` + 错误文案后，状态气泡仍显示 `Running` 和原始 prompt 摘要。

**复现步骤**：

1. 提交一个 prompt 触发会话。
2. 等待 LLM 返回错误（如 Gateway Timeout 重试耗尽）。
3. SessionWindow 显示 `failed`，但状态气泡仍显示 `Running`。

**期望**：SessionWindow 收到 `.assistantMessageEnd`、`.status`、`.error` 后，应同步更新 `SessionRegistry` 中对应 `SessionSummary`。状态气泡应在 failed/idle/running 间与当前会话窗口一致。

**根因边界**：`AppCoordinator.handleSubmitPrompt()` 创建会话时只向 `SessionRegistry` 写入一次 `isRunning: true`；`SessionViewModel.handle(.error)` 更新窗口内 status 但没有回写 `SessionRegistry`。

**状态**：已修复。

**checkpoint 与结论**：

- `SessionEvent(.error/.status/.assistantMessageEnd)` -> `SessionViewModel.handle(_:)`：窗口内 `status`、`error`、`messages` 已按预期更新，失败点不在事件解析或窗口状态维护。
- `SessionViewModel.handle(_:)` -> `SessionRegistry`：修复前 RED 测试证明 registry 仍停留在创建会话时的 `isRunning: true` 与原始 prompt 摘要；现由 `SessionViewModel` 暴露 `onStateChanged` 闭包，`SessionLifecycle` 接收后同步 `SessionSummary`。
- `SessionRegistry` -> `StatusBubbleViewModel`：StatusBubble 继续只从 registry 派生 `isRunning` / `latestSummary`，不新增 mirror 状态；registry 更新后气泡会随 failed/idle/running 状态变化。

**发现日期**：2026-05-19

**修复日期**：2026-05-20

---

### 5. Tool message UI 在部分 tool 结果中展示了入参而非实际结果

**严重级别**：P1

**现象**：tool 实际执行结果已经正确写入 session 持久化，但 SessionWindow 可见 tool 气泡在部分场景展示的是调用入参摘要，而不是 tool result。

**复现步骤**：

1. 使用 mock LLM 打包启动：`bash ./scripts/package-app.sh --mock-llm`。
2. 提交 `[mock:workspace-list] QA workspace.list`。
3. 授权 `workspace.list` 后观察 SessionWindow。
4. 提交 `[mock:path-escape] QA 越狱写入拦截`。
5. 授权 `file.write` 后观察 SessionWindow。

**实际结果**：

- `workspace.list` UI 气泡显示 `workspace.list: {}`，但 session 文件中的 tool result 包含完整 workspace 列表。
- 越狱 `file.write` UI 气泡显示 `{"workspaceId":"qa-workspace","relativePath":"../../etc/passwd","content":"should be rejected"}`，但 session 文件中的 tool result 是 `Path escapes workspace root: ../../etc/passwd`。

**期望结果**：SessionWindow 的 completed tool 气泡应展示实际 tool result；错误结果应显示明确错误文案，而不是继续显示 tool 入参。

**证据**：

- `~/.spotAgent/sessions/FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json` 中 `workspace.list` 的 `tool_result.output` 包含 `default`、`tmp`、`qa-workspace`、`handagent-test`。
- `~/.spotAgent/sessions/AC07B7E0-9852-48A0-B38D-DC8016DE3352.json` 中 `file.write` 的 `tool_result.status` 为 `error`，`output` 为 `Path escapes workspace root: ../../etc/passwd`。

**初步调用链 / 根因边界**：

- agent-server 持久化：`AgentRuntime` 已正确写入 `tool_result` event，说明 runtime/tool 层结果正常。
- UI 展示：SessionWindow 收到 `tool_message` 后可能保留了 running 阶段的 arguments 文本，或 MessageTranslator / ViewModel 合并 completed tool message 时未用 result text 覆盖旧文本。
- 下一步应从 `SessionRuntimeOrchestrator` 下发 `tool_message`、`MessageTranslator` 转换和 `SessionViewModel` 合并消息三处追踪。

**状态**：已修复。

**根因边界**：`AgentRuntime` 的 `tool_result.output`、`MessageTranslator.toSessionMessage()` 生成的 completed/failed `tool_message.text`、`SessionRuntimeOrchestrator` 下发帧与审计事件均已正确携带实际结果。失败点在桌面端 `SessionViewModel.handle(.toolMessage)`：running 阶段和 completed/failed 阶段使用同一个 `messageID`，但 ViewModel 每次都追加新的 tool 气泡，导致 UI 保留了最先展示的入参气泡。修复后同 ID 的 terminal tool message 会更新已有 tool 气泡文本。

**checkpoint 与结论**：

- `AgentRuntime/tool_result` -> session 持久化：既有证据中 `~/.spotAgent/sessions/FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json` 的 `workspace.list` `tool_result.output` 包含 workspace 列表，`~/.spotAgent/sessions/AC07B7E0-9852-48A0-B38D-DC8016DE3352.json` 的 `file.write` `tool_result.output` 为 `Path escapes workspace root: ../../etc/passwd`，说明 runtime/tool 层正常。
- `MessageTranslator` -> `SessionRuntimeOrchestrator`：既有 `MessageTranslator.test.ts` 与 `SessionRuntimeOrchestrator.test.ts` 覆盖 `tool_result` 转成 completed/failed `tool_message`，并把同一 output 写入 audit event。
- `SessionViewModel` 合并/渲染：修复前 RED 测试 `SessionViewModelTests.testTerminalToolMessageReplacesRunningArgumentsBubble` 证明同一 `messageID` 的 running/terminal tool frame 会形成重复气泡，列表中保留 `workspace.list: {}` 与 `file.write` 入参 JSON；修复后该测试通过。

**发现日期**：2026-05-19

**修复日期**：2026-05-20

---

### 7. 关闭 SessionWindow 后挂起权限请求未立即取消

**严重级别**：P2

**现象**：SessionWindow 内出现权限审批气泡后，直接关闭窗口，挂起的 `file.write` 权限请求没有立即取消；约 60 秒后原 session 仍写入 deny 的 `permission_request` 和 `tool_result`。

**复现步骤**：

1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。
2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
3. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel。
4. 输入 `[mock:permission-write] QA close pending permission manual 20260520` 并提交。
5. SessionWindow `Session 8056DDA1` 出现 `授权调用 file.write` 内联权限气泡后，不点击任何授权按钮，直接关闭窗口。
6. 等待约 60 秒后检查 `~/.spotAgent/sessions/8056DDA1-76B5-425B-A8DA-773D1C3CE41C.json`。

**实际结果**：

- 关闭窗口后 2 秒检查时只剩状态气泡，session 文件只有 1 条 user message。
- 约 60 秒后同一 session 文件被追加 assistant tool call、tool message 和 final assistant message。
- events 中出现 `permission_request`，`action: "deny"`，随后写入 `tool_result`，`output: "用户拒绝执行该 tool"`。

**期望结果**：关闭 SessionWindow 时应立即取消该窗口绑定的挂起权限请求，不应等待超时后继续向已关闭 session 写入 permission / tool / assistant 消息；后续新会话的权限审批仍应可正常出现和响应。

**证据**：

- 关闭前 UI：Computer Use 可见 `Session 8056DDA1` 中有 `授权调用 file.write` 气泡，参数为 `workspaceId: "qa-workspace"`、`relativePath: "permission-check.txt"`、`content: "permission scenario content"`。
- 关闭后窗口状态：`System Events` 只剩状态气泡窗口 `280x62`。
- Session 文件：`~/.spotAgent/sessions/8056DDA1-76B5-425B-A8DA-773D1C3CE41C.json` 后续变为 `messageCount: 4`，包含 `toolCalls`、`tool` content `用户拒绝执行该 tool` 与 `Mock permission write completed.`。
- 后续新会话 `Session 8BFFA3D9` 仍可出现新的 `授权调用 file.write` 气泡，说明权限系统未整体卡死，但旧挂起请求未被立即清理。

**原始待验证假设**：

- `SessionWindow` 关闭 -> WebSocket close / session unbind：窗口确实关闭，UI 只剩状态气泡。
- `SessionPermissionBridge.unbindSession` 后，已挂起的 ask promise 可能没有立即以 cancelled / deny 结束，仍保留到 60 秒 timeout。
- `AgentRuntime` 在后续 deny 后继续把 tool denial 和 final assistant 追加到原 session，说明取消没有传到 runtime 当前 run。

**状态**：已修复。

**根因边界**：初步判断中的 `SessionPermissionBridge.unbindSession` 不会立即结束 pending ask 并不成立。`SessionPermissionBridge` 已能在 socket 解绑时用 `reason: "session closed"` 结束同 token 的 pending ask；真正失败点在 `attachSessionSocketHandlers` 的 WebSocket close 处理：关闭当前 socket 时只解绑 permission / workspace 请求并清理 session 权限规则，没有调用 `SessionRuntimeOrchestrator.interruptSession()` 中断该 session 的 active run。`AgentRuntime` 因此会把 permission deny 当作普通 tool 拒绝结果继续跑完后续回合，并最终把 `permission_request`、`tool_result` 和 final assistant 写回已关闭 session。

**checkpoint 与结论**：

- `SessionWindow` 关闭 -> tab socket disconnect：桌面侧 `SessionWindowLifecycle.close()` 会对每个 tab 调用 `SessionTabViewModel.disconnect()`，后者调用 `SessionSocketClient.disconnect()` 并取消 WebSocket；失败点不在窗口外壳释放。
- WebSocket close -> session unbind：`attachSessionSocketHandlers` close handler 会按 socket 绑定 token 调用 `permissionBridge.unbindSession(sessionId, token)`；既有 server 测试覆盖当前 socket 关闭会解绑，stale socket 关闭不会清理新绑定。
- session unbind -> pending permission ask：`SessionPermissionBridge.unbindSession()` 已调用 `failPendingForToken()`，可立即 resolve `{ decision: "deny", reason: "session closed" }`；失败点不在 pending ask 超时器。
- WebSocket close -> active runtime interrupt：修复前 RED 测试 `attachSessionSocketHandlers > interrupts the active run owned by a socket when that socket closes` 失败，`runtimeSignal.aborted` 为 `false`，证明 close 链路没有中断 active run。
- active runtime interrupt -> 持久化：修复后当前 socket 成功解绑 session 时同步调用 `router.interruptSession(sessionId, sendSession)`；`SessionRuntimeOrchestrator` 复用既有 abort 逻辑，忽略后续 late assistant/tool 输出，持久化只保留用户消息。
- stale socket 边界：只有 `permissionBridge.unbindSession(sessionId, token)` 返回 `true` 时才中断 runtime；stale socket close 返回 `false`，不会误中断同 session 的新 socket run。

**发现日期**：2026-05-20

**修复日期**：2026-05-21

---
