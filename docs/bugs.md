# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-21。

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


### 2. ScreenCaptureKit 反向 IPC 在已开启屏幕录制权限后仍返回 permission_denied

**严重级别**：P2

**发现日期**：2026-05-21

**复现步骤**：

1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。
2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
3. 在系统设置「隐私与安全性 → 录屏与系统录音」里确认 `HandAgentDesktop` 开关为开启；若先关闭过，再重新开启并按系统提示重启 app。
4. 在 PromptPanel 提交 `[mock:screen-display] QA screen capture display`。
5. 点击 `screen.capture` 授权气泡中的「仅本次」。
6. 检查 SessionWindow 与 `~/.spotAgent/sessions/session-1779316378563-ce3kgj.json`。

**实际结果**：

- SessionWindow 显示 `screen.capture: Failed to enumerate shareable content (用户拒绝了应用程序、窗口、显示器捕捉的TCC)。请确认 HandAgent 已获得「屏幕录制」权限。`
- session 文件 `~/.spotAgent/sessions/session-1779316378563-ce3kgj.json` 记录了 `permission_request(action: allow)`、`tool_call(screen.capture display)` 与 `tool_result(status: error)`。
- `sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db"` 可查到 `kTCCServiceScreenCapture|com.yourname.HandAgentDesktop|0|2|4|1779316195`。
- `swift -e 'import CoreGraphics; print(CGPreflightScreenCaptureAccess())'` 返回 `true`，说明系统侧预检已通过，但应用内 `SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)` 仍报 TCC 拒绝。
- 2026-05-21 重新打包后清理重复 bundle-id 进程并只保留 worktree `codex/manual-qa-audit` 的 desktop pid `47574` / agent-server pid `47575`，`[mock:screen-display] QA screen capture display clean bridge 20260521` 已确认能通过 platform bridge 到达桌面 provider，但当前 app 进程内 `CGPreflightScreenCaptureAccess()` 返回 false，tool result 为 `HandAgent 没有屏幕录制权限。请打开「系统设置 → 隐私与安全性 → 屏幕录制」，允许 HandAgent 后重试。`
- 同轮取证显示当前 app 的 designated requirement 为 `designated => identifier "com.yourname.HandAgentDesktop"`，但 TCC 中 `kTCCServiceScreenCapture` 的 `csreq` 是旧 hash-style requirement：`FADE0C0000000028000000010000000800000014398791BDD8B31D8F6048BE46BB3973B34FEE5611`。因此当前 blocker 更接近本地 TCC 身份记录与新打包 app 不匹配，而不是 platform bridge 未连通。

**期望结果**：

`screen.capture` 在已授予屏幕录制权限并重启 app 后，应能返回 `imageBase64` 的 display 截图；如果仍无法枚举 shareable content，错误必须能指向真实原因，而不是继续冒充用户拒绝。

**证据**：

- UI：PromptPanel 授权气泡参数为 `{ "target": { "kind": "display" } }`；确认授权后 SessionWindow 仍显示上述错误。
- session 文件：`~/.spotAgent/sessions/session-1779316378563-ce3kgj.json`。
- 重新验证 session 文件：`~/.spotAgent/sessions/session-1779319444567-r98dh6.json`，记录 `permission_request(action: allow)`、`tool_call(screen.capture display)` 与 `tool_result(status: error)`，输出为当前 app 进程内 preflight denied 的中文权限引导。
- TCC 数据库：`kTCCServiceScreenCapture|com.yourname.HandAgentDesktop|0|2|4|1779316195`。
- shell 进程系统预检：`swift -e 'import CoreGraphics; print(CGPreflightScreenCaptureAccess())'` 返回 `true`，但该结果不等同于 packaged HandAgent 进程的 TCC 状态。
- 签名取证：`codesign -dvvv --requirements - dist/HandAgentDesktop.app` 输出当前 app requirement 为 `designated => identifier "com.yourname.HandAgentDesktop"`；`codesign --verify --verbose=4 dist/HandAgentDesktop.app` 显示 app satisfies its Designated Requirement。

**初步调用链 / 根因边界**：

- `MockLLMClient` -> `tool_call(screen.capture)` -> `SessionPermissionBridge`：权限审批链路正常，用户已允许本次调用。
- `SessionRuntimeOrchestrator` -> `WebSocketPlatformBridge` -> `PlatformBridgeService`：2026-05-21 clean bridge 回归中已验证 platform bridge 可连通；重复 bundle-id 进程曾导致 `Platform bridge is not connected`，清理后该问题消失，属于 QA 环境干扰。
- `PlatformBridgeService` -> `MacPlatformProvider.captureScreen()`：当前失败点前移到 packaged app 进程内 `CGPreflightScreenCaptureAccess()` 返回 false。
- TCC / code-sign requirement：现有 TCC allow row 与当前 app signing requirement 不一致，下一步应重置/重新授权当前 bundle id 后复测 display/window/3-request，或把 package/TCC 身份稳定性继续做成可回归的 QA 步骤。

**修复进展**：

- 2026-05-21 已修改 `MacPlatformProvider.captureScreen()`：进入 ScreenCaptureKit 枚举前先在当前 packaged app 进程内执行 `CGPreflightScreenCaptureAccess()`，必要时调用 `CGRequestScreenCaptureAccess()`；预检拒绝时返回中文 `permission_denied` 权限指引。
- 若预检通过但 `SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)` 仍失败，错误改为 `capture_failed`，并携带 `preflight`、`domain`、`code`、`message`，不再把 ScreenCaptureKit 枚举失败统一报告成用户拒绝。
- 定向测试已覆盖：预检通过时不重复请求、预检拒绝时请求权限、请求拒绝时返回中文权限指引、预检通过但 shareable content 枚举失败时返回 `capture_failed`。

**状态**：代码侧错误分类已修复，实机 display/window 截图仍待用户明确允许重置并重新授予当前 bundle id 的屏幕录制权限后回归。
