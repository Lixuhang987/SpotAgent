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

### Computer Use MCP `get_app_state` 会把 `Finder` 误匹配为 `Keka Finder Integration`

- **严重级别**：P0
- **发现日期**：2026-05-22
- **验证环境**：`main` 分支 `4547246`，`bash ./scripts/package-app.sh --mock-llm` 启动 `dist/HandAgentDesktop.app`，`~/.spotAgent/mcp.json` 注册 `computer_use` stdio server：
  - `command`: `./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient`
  - `cwd`: `/Users/mu9/.codex/plugins/cache/openai-bundled/computer-use/1.0.793`
  - `args`: `["mcp"]`
  - `requestTimeoutMs`: `10000`
  - `elicitation.autoAcceptEmptyForm`: `true`
- **基线结果**：`bash ./scripts/test.sh` 通过，`bash ./scripts/swiftw test` 通过，`bash ./scripts/swiftw build` 通过。
- **复现步骤**：
  1. 启动 mock App 后用 `Command+Shift+Space` 打开 PromptPanel。
  2. 输入 `run [mock:computer-use-get-finder]` 并提交。
  3. 在 SessionWindow 权限气泡中允许 `mcp.computer_use.get_app_state { "app": "Finder" }`。
- **实际结果**：
  - 会话可正常创建，`mcp.computer_use.get_app_state` 可注入并完成权限审批。
  - tool 调用不再出现 `MCP stdio request timed out after 10000ms: tools/call`。
  - `get_app_state` 返回 `status: success`，但 `app: "Finder"` 被解析为 `Keka Finder Integration`（`bundleId: "com.aone.keka.KekaFinderIntegration"`），不是真正的 Finder（`bundleId: "com.apple.finder"`）。
- **期望结果**：
  - `mcp.computer_use.get_app_state { "app": "Finder" }` 应优先匹配真正的 Finder / 访达，即 `bundleId: "com.apple.finder"`，再返回其截图与 accessibility tree。
  - 模糊子串匹配不应优先命中 `Keka Finder Integration` 这类包含 Finder 字样的辅助进程。
- **证据**：
  - `~/.spotAgent/sessions/session-1779389954542-o9gypl.json`：`mcp.computer_use.list_apps` 的 `tool_result.status` 为 `success`，`durationMs: 30`，输出包含本机 App 列表，证明旧 `tools/call` 超时已关闭。
  - `~/.spotAgent/sessions/session-1779389984826-xub6b1.json`：`mcp.computer_use.get_app_state` 的 `tool_result.status` 为 `success`，`durationMs: 195`，输出 `app.name: "Keka Finder Integration"`、`bundleId: "com.aone.keka.KekaFinderIntegration"`、`accessibilityTree.title: "KekaFinderIntegration"`。
  - 同一轮 `list_apps` 输出中存在真正 Finder：`name: "访达"`、`bundleId: "com.apple.finder"`、`activationPolicy: "regular"`。
- **初步调用链 / 根因边界**：
  - 已验证链路：`~/.spotAgent/mcp.json` 解析 → `SessionScopedToolRegistry` 全局注入 `mcp.computer_use.*` → mock LLM 触发 tool call → HandAgent 权限审批允许 → `ComputerUseMCPClient.getAppState` → `RemotePlatformAdapter.listApps()` → `resolveApp(apps, "Finder")`。
  - 首个失败边界：`ComputerUseMCPClient.resolveApp` 在精确 `bundleId` / `name` 未命中后，直接按列表顺序做 `name.includes("finder") || bundleId.includes("finder")`，因此先命中 `Keka Finder Integration`，没有优先选择 regular app、系统 Finder bundle id 或更高质量的词边界匹配。
