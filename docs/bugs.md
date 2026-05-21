# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-21。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复前先写出预期调用链，并把每一跳标成 checkpoint：说明该跳应发生什么、如何观察、什么证据能证明。
- 按顺序复现并验证每个 checkpoint，停在第一个未被证实的跳点；不要提前假设后续链路成功或失败。
- 只有在明确证明某一跳失败后，才实施最小修复；修复完成后需要补回能防止回归的测试或手工验收记录，并重新验证完整链路。

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

## 已修复 bug

### 1. 快捷键修改配置不会生效

**现象**：用户在设置页修改快捷键配置后，新配置不会在运行中的桌面 App 里生效。

**预期**：保存或录入新的快捷键后，后续全局快捷键触发应立即使用最新配置；若需要重新注册监听，也应由 Settings 保存链路或快捷键服务显式完成。

**状态**：已修复。

**checkpoint 与结论**：

- 设置页录入 -> `KeyboardShortcuts` 存储：`KeyboardShortcuts.Recorder` 走库内 `setShortcut`，会写入 `UserDefaults` 并发送 `KeyboardShortcuts_shortcutByNameDidChange` 通知。
- `KeyboardShortcuts` 存储 -> Hotkey registrar 监听更新：失败点在宿主热键层缺少显式监听/重绑定契约。现已由 `NamedHotkeyRegistrar` 订阅同名快捷键变更通知，收到变更后先移除旧 handler，再按新配置重新绑定。
- Hotkey registrar -> `AppCoordinator` 回调：`ProductionHotkeyRegistrar` 仍只注册 `showPromptPanel` / `captureSelection` / `captureRegion` 三条 handler，业务回调不变。
- `PromptPanel` action 快捷键：无需额外缓存失效；`PromptPanelViewModel.shortcutLabel(for:)` 与 `PromptPanelController` 局部 keyDown 匹配都实时读取 `KeyboardShortcuts.getShortcut(for:)`。回归测试覆盖同名 action shortcut 更新后 label 读取新值。

**验证**：

- `HotkeyRegistrarTests.testNamedHotkeyRebindsHandlerWhenShortcutChanges` 覆盖同名 `KeyboardShortcuts.Name` 更新后运行中 handler 重新绑定到新配置。
- `HotkeyRegistrarTests.testPromptActionShortcutLabelReadsUpdatedStoredShortcut` 覆盖 PromptAction 快捷键从存储读取更新值。

### 2. 普通唤起 PromptPanel 会自动采集当前选区

**严重级别**：P0

**现象**：使用默认全局热键 `showPromptPanel` 唤起 PromptPanel 时，会自动执行选区采集，将前台 App 的选中内容隐式带入 LLM 上下文。

**复现步骤**：

1. 在任意 App 中选中一段文字。
2. 按 `showPromptPanel` 热键（默认 ⌘⇧Space）唤起 PromptPanel。
3. 输入任意 prompt 并提交。
4. 查看 `~/.spotAgent/sessions/<session-id>.json`，user message 中包含了未主动提供的选区内容。

**期望**：普通 `showPromptPanel` 只打开输入面板并聚焦输入框，不采集选区。只有 `captureSelection` 快捷键路径才采集选区并展示 textSelection chip。

**状态**：已修复。

**根因边界**：`PromptPanelController.show()` 内固定调用 `captureSelectionIfPossible()`，导致普通 `showPromptPanel` / `togglePromptPanel` 与用户主动 `captureSelection` 共用同一采集入口。修复后 `PromptPanelController.show()` 只负责窗口展示与聚焦；文本选区采集只保留在 `PromptCaptureCoordinator.captureSelectionAndShow()` 的主动快捷键路径。

**checkpoint 与结论**：

- `AppCoordinator.setupHotkey()` -> `.showPromptPanel` -> `send(.togglePromptPanel)`：路径保持不变，仍只进入面板显示分支。
- `send(.togglePromptPanel)` -> `PromptPanelController.toggle()` -> `show()`：已验证失败点在 `show()` 内隐式调用 selection provider；修复后 `PromptPanelController` 不再持有 selection provider，回归测试证明普通 `show()` 不会追加 `.textSelection` 附件。
- `captureSelection` 热键 -> `PromptCaptureCoordinator.captureSelectionAndShow()`：主动采集路径仍在 `show()` 前调用 `SelectionCaptureProvider.captureSelectedText()`，不依赖 `PromptPanelController.show()` 的副作用。

**验证**：

- 修复前 RED 证据：临时定向测试把 provider 注入 `PromptPanelController.show()` 后失败，inverted expectation 被触发，且 `viewModel.attachments` 出现 `textSelection("implicit selection")`。
- 修复后 `bash ./scripts/swiftw test --filter PromptPanelControllerTests` 通过；真实执行了 `testShowDoesNotAppendSelectionAttachment` 与 `testCaptureSelectionCoordinatorStillAppendsSelectionBeforeShowingPanel`。
- 修复后 `bash ./scripts/swiftw test` 通过。

**发现日期**：2026-05-19（commit 环境：`codex/real-launch-qa-report` 分支）

**修复日期**：2026-05-20

---

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

**验证**：

- 修复前 RED 证据：`bash ./scripts/swiftw test --filter SessionLifecycleTests` 中新增的 `testViewModelErrorUpdatesRegistrySummary`、`testAssistantMessageEndUpdatesRegistrySummaryToIdle`、`testStatusEventsUpdateRegistryRunningStateWhilePreservingSummary` 失败，registry 仍为 `isRunning: true` 且摘要仍是 `hello`。
- 修复后 `bash ./scripts/swiftw test --filter SessionLifecycleTests` 通过。

**发现日期**：2026-05-19

**修复日期**：2026-05-20

---

### 4. worktree 启动时 agent-server 使用了主仓库路径

**严重级别**：P1

**现象**：从 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop` 时，子进程 node 命令行指向主仓库 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`，而非当前 worktree 下的同名文件。

**复现步骤**：

1. 在 `.worktrees/<name>/` 下修改 `apps/agent-server/src/server.ts`。
2. 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
3. `lsof -nP -iTCP:4317 -sTCP:LISTEN` 查看 node 进程命令行，指向主仓库路径。

**期望**：agent-server 应使用同一 worktree 下的 `apps/agent-server/src/server.ts`。若无法定位同一 worktree，应在 UI 或日志中明确暴露启动路径。

**根因边界**：`AgentServerService.locateRepositoryRoot()` 的候选包含 `Bundle.main.executableURL`、`Bundle.main.resourceURL`、`Bundle.main.bundleURL` 和当前工作目录，但候选顺序优先 Bundle 路径。worktree 内 `bash ./scripts/swiftw run HandAgentDesktop` 可能复用主仓库构建产物路径，导致 Bundle 候选先命中主仓库，当前 worktree cwd 没有机会作为 repo root。

**状态**：已修复。

**checkpoint 与结论**：

- `bash ./scripts/swiftw run HandAgentDesktop` -> 进程 cwd：`scripts/swiftw` 在当前 worktree 内执行 `swift run`，应把 `FileManager.default.currentDirectoryPath` 暴露给桌面进程；失败点不在脚本参数传递。
- `AgentServerService.locateRepositoryRoot()` -> repo root 选择：修复前 RED 测试证明当 Bundle 候选和 currentDirectory 候选都指向有效仓库时，旧顺序会返回 Bundle 所在主仓库；修复后 `AgentServerRepositoryRootLocator` 优先检查 currentDirectory，再回退到 Bundle 候选。
- repo root -> node 子进程：`launchProcess()` 继续用解析出的 repo root 同时设置 `process.currentDirectoryURL`、`NODE_PATH` 和 `apps/agent-server/src/server.ts` 绝对入口；因此 root 选择修正后，agent-server 命令行与模块解析都落在同一 worktree。

**验证**：

- 修复前 RED 证据：临时恢复旧候选顺序后，`bash ./scripts/swiftw test --filter 'AgentServerRuntimeModeTests/testRepositoryRootLocatorPrefersCurrentWorktreeOverBundleRepository'` 失败，实际解析为 `/repo/main-repo` 而非 `/repo/worktree-repo`。
- 修复后同一测试通过。

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

**验证**：

- `bash ./scripts/swiftw test --filter SessionViewModelTests/testTerminalToolMessageReplacesRunningArgumentsBubble`

**发现日期**：2026-05-19

**修复日期**：2026-05-20

---

### 6. packaged App 从 `/` cwd 启动时仓库根查找不终止

**严重级别**：P1

**现象**：从打包后的 `dist/HandAgentDesktop.app` 启动 mock App 时，`HandAgentDesktop` 进程存在且 CPU 接近 100%，但没有窗口，也没有 `*:4317` agent-server listener。

**复现步骤**：

1. 在 worktree 中执行 `bash ./scripts/package-app.sh --mock-llm`。
2. 使用 `open dist/HandAgentDesktop.app` 启动。
3. 观察 `HandAgentDesktop` 进程存在，但 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 无输出，Computer Use 也无法看到状态气泡或其他窗口。
4. 对桌面进程采样，主线程停在 `AgentServerRepositoryRootLocator.findRepositoryRoot`。

**期望**：packaged App 即使当前工作目录是 `/`，仓库根定位也应有限终止，并继续检查 bundle executable / resource / app bundle 候选，最终拉起当前 bundle 对应 worktree 下的 agent-server。

**根因边界**：`URL(fileURLWithPath: "/").deletingLastPathComponent()` 会产生 `/..`、`/../..` 等路径，旧的 `findRepositoryRoot(startingAt:)` 只比较 `parent.path == current.path`，没有显式处理根目录或循环路径，导致从 `/` 起始时无限向上查找。

**状态**：已修复。

**checkpoint 与结论**：

- packaged App 启动 -> `AgentServerHealth.start()`：主线程采样显示卡在 agent-server 启动前的 repository root 查找阶段，失败点不在 node 子进程或 WebSocket 监听。
- `findRepositoryRoot(startingAt: "/")` -> parent 递进：Swift one-liner 证明 `/` 的 `deletingLastPathComponent()` 不会稳定停在同一路径，而是产生 `/..` 链；修复后定位器用 `visitedPaths` 防循环，并在 `currentPath == "/"` 时返回 `nil`。
- cwd 候选失败 -> bundle 候选：回归测试覆盖 `currentDirectoryURL: "/"` 时，定位器能继续回退到 bundle executable/resource/bundle 所在仓库。

**验证**：

- 定向测试：`bash ./scripts/swiftw test --filter AgentServerRuntimeModeTests/testRepositoryRootLocatorFallsBackToBundleWhenCurrentDirectoryIsRoot` 通过。
- 实机验证：修复后重新 `bash ./scripts/package-app.sh --mock-llm` 并 `open dist/HandAgentDesktop.app`，可见状态气泡 `280x62`，`lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 node pid `2398` 监听，`ps -o pid,ppid,command -p 2398` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-status-bubble-focus/apps/agent-server/src/server.ts`。

**发现日期**：2026-05-20

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

**验证**：

- 修复前 RED 证据：`pnpm vitest run apps/agent-server/tests/server/server.test.ts --testNamePattern 'interrupts the active run owned by a socket when that socket closes'` 失败，断言 `runtimeSignal?.aborted` 期望 `true`、实际 `false`。
- 修复后定向测试：`pnpm vitest run apps/agent-server/tests/server/server.test.ts` 通过，覆盖当前 socket close 中断 active run、stale socket close 不误中断、permission 绑定清理。
- 修复后完整 TS 测试：`bash ./scripts/test.sh` 通过，210 个测试通过，1 个 integration 跳过。

**发现日期**：2026-05-20

**修复日期**：2026-05-21

---

### 8. 删除 running session 后已打开 tab 仍显示运行中

**严重级别**：P2

**现象**：通过历史侧栏删除一个正在运行且已打开的 session 后，server 已删除 session 文件、历史列表已刷新，但顶部 tab bar 仍保留该 running tab，点击后仍显示 `运行中` 与 Stop 控件。

**期望结果**：

删除 running session 后，server 删除文件并返回 `delete_session_response` 时，桌面端应同步关闭对应已打开 tab，不应继续显示可交互的 `运行中` tab。

**状态**：已修复。

**根因边界**：

- `SessionRouter.handleDeleteSession()` 已先 interrupt 再删除 session 文件，并发送 `delete_session_response`；原始 QA 中 session 文件删除成功，说明 server 侧链路正常。
- 失败点在 `SessionWindowViewModel.handleWindowEvent(.deleteSessionResponse)`：旧实现只调用 `refreshHistory()`，没有关闭 `tabs` 中 `sessionID == targetSessionID` 的已打开 tab。
- 修复后仅当 `status == "deleted"` 且本窗口存在匹配 tab 时调用 `closeTab(tab.tabID)`，再刷新历史；`not_found` 等非删除响应只刷新历史，不关闭当前 tab。

**checkpoint 与结论**：

- server delete -> 持久化：实机回归中目标文件 `~/.spotAgent/sessions/session-1779320015436-9bdfno.json` 删除后不存在，按 prompt 搜索 `~/.spotAgent/sessions/` 无残留。
- `delete_session_response` -> ViewModel：修复后的 `SessionWindowViewModel` 会关闭匹配 open tab，并触发该 tab socket disconnect。
- UI tab bar：实机回归中删除前标题显示 `运行中 4 个已打开标签页`，删除后回到完成态 tab，标题显示 `空闲 3 个已打开标签页`，顶部 slow-focus tab 消失。
- socket 清理：删除前 `lsof -nP -iTCP:4317` 有 `HandAgent` fd `17` / node fd `17` 的 session WebSocket；删除后该连接消失，只剩 platform、history 与 3 个 open tab 连接。

**验证**：

- 桌面定向测试覆盖删除成功后关闭匹配 active tab 并回退到剩余 tab：`SessionWindowViewModelTests.testDeletedSessionResponseClosesMatchingActiveTabAndFallsBackToRemainingTab`。
- 桌面定向测试覆盖非 deleted 响应不关闭 tab：`SessionWindowViewModelTests.testNonDeletedSessionResponseOnlyRefreshesHistoryList`。
- 实机回归环境：mock-llm / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`，desktop pid `47574`，agent-server pid `47575`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
- 实机回归目标 session：`~/.spotAgent/sessions/session-1779320015436-9bdfno.json`，prompt 为 `[mock:slow-focus] QA delete running regression fixed 20260521 target`，删除前 `messageCount: 1`，删除后文件不存在。

**发现日期**：2026-05-21

**修复日期**：2026-05-21

---

### 9. 真实 provider streaming 被网络日志包装器缓冲

**严重级别**：P1

**现象**：真实 provider 返回 `text/event-stream` 时，网络日志包装器先读取 clone body，导致 AI SDK 只能在响应结束后消费原 response，SessionWindow 里看不到真实 token 级逐段更新。

**期望结果**：`text/event-stream` response 不应被日志包装器 clone/read 阻塞。日志可以记录占位信息，但必须立即返回原 response，让 AI SDK 按 SSE 增量消费。

**状态**：已修复。

**根因边界**：

- provider -> HTTP SSE：真实 provider 可返回 `text/event-stream`。
- `createLoggingFetch()` -> AI SDK：失败点在日志包装器返回 response 前等待 `response.clone().text()`，使 SSE 消费被延迟到完整响应结束。
- AI SDK -> `AgentRuntime` -> WebSocket -> SwiftUI：mock streaming 已覆盖多段 delta；真实 provider 回归证明修复后该链路也能逐段进入 UI。

**修复方式**：

- `packages/core/src/logging/createLoggingFetch.ts` 在 response `content-type` 包含 `text/event-stream` 时，不再 clone/read body，只记录 `[streaming response: text/event-stream]` 并立即返回原 response。
- `safeLog()` 改为吞掉 logger 异常，避免网络日志失败影响真实 fetch。

**验证**：

- 定向测试覆盖 streaming response 会立即返回，且不会等待 body close：`packages/core/tests/logging/logging-fetch.test.ts`。
- 定向测试覆盖 logger 失败不会让 fetch 失败。
- 实机回归环境：real LLM / worktree `codex/manual-qa-audit` / 非 mock `dist/HandAgentDesktop.app`，desktop pid `53098`，agent-server pid `53099`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
- 网络日志：`~/.spotAgent/log/2026-05-21/network-005.jsonl` 第 13-14 行，`2026-05-21T00:07:31.103Z` 真实请求，`2026-05-21T00:07:33.759Z` 响应为 `[streaming response: text/event-stream]`。
- UI 截图序列：`/tmp/handagent-qa/streaming/clean-real-ui-20260521/frame-05-w52241.png` 为空 assistant 气泡，`frame-07-w52241.png` 显示 `LIVE_STREAM_START`，`frame-08-w52241.png` 显示第 1-7 行并正在输出第 8 行，`frame-09-w52241.png` 显示第 1-14 行并正在输出第 15 行；这些帧顶部都处于 `运行中`。
- Session 文件：`~/.spotAgent/sessions/session-1779322051046-px8urh.json`，`messageCount: 2`，assistant 长度 `35801`，共 `901` 行，末尾为 `900. Line 900: visible streaming proof.`。

**发现日期**：2026-05-21

**修复日期**：2026-05-21

---

### 10. 权限请求超时后授权气泡仍残留

**严重级别**：P2

**现象**：一个 tool 权限请求等待 60 秒超时后，server 已写入 deny 的 `permission_request` 和 failed `tool_result`，SessionWindow 也显示了 `clipboard.read: 用户拒绝执行该 tool`，但同一 tab 底部仍保留 `授权调用 clipboard.read` 的 pending 授权气泡。

**期望结果**：server 端权限超时或用户拒绝后，只要对应 tool call 已收到 terminal `tool_message`，桌面端就应清理同一个 pending 授权气泡，不应继续展示可点击的过期审批 UI。

**状态**：已修复。

**根因边界**：

- `SessionPermissionBridge` 超时链路正常：session 文件已记录 deny 的 `permission_request` 和 failed `tool_result`。
- `MessageTranslator` 正常把 failed `tool_result` 下发为 terminal `tool_message`，`messageId` 为 `${sessionId}-${toolCallId}`。
- 失败点在桌面端 `SessionTabViewModel`：旧实现只在用户点击授权按钮的 `resolvePermission()` 中移除 `pendingPermissionRequests`，没有在 terminal `tool_message` 到达时清理对应 request；同时 `SessionEvent.permissionRequest` 未携带 `toolCallId`，无法可靠匹配同一 tool call。

**checkpoint 与结论**：

- permission request -> UI：实机复现中 SessionWindow 出现 `授权调用 clipboard.read` 气泡，说明请求已到达对应 tab。
- server timeout -> 持久化：`~/.spotAgent/sessions/session-1779324248724-d3or6x.json` 记录 `clipboard.read` 超时拒绝与 `tool_result.status: error`。
- terminal tool message -> UI：修复前截图 `/tmp/handagent-qa/protocol-retry-a-mixed-20260521.png` 同时显示 `clipboard.read: 用户拒绝执行该 tool` 和残留的授权气泡，证明失败点在桌面端 pending UI 清理。
- 修复后 `SessionEvent.permissionRequest`、`SessionPermissionRequest` 与 socket 解码携带 `toolCallId`；`SessionTabViewModel` 和 legacy `SessionViewModel` 在收到 `completed` / `failed` 的 terminal `tool_message` 后按 `sessionID + toolCallId + toolName` 清理匹配的 pending 请求。

**验证**：

- 修复前 RED 证据：`bash ./scripts/swiftw test --filter SessionTabViewModelTests/testTerminalToolMessageClearsMatchingPendingPermissionRequest` 编译失败，提示 `permissionRequest` 缺少 `toolCallId` 参数，覆盖了无法匹配 pending request 的数据缺口。
- 修复后定向测试通过：
  - `bash ./scripts/swiftw test --filter SessionTabViewModelTests/testTerminalToolMessageClearsMatchingPendingPermissionRequest`
  - `bash ./scripts/swiftw test --filter SessionSocketClientTests`
  - `bash ./scripts/swiftw test --filter SessionViewModelTests`
- 实机回归环境：mock-llm / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`，desktop pid `62834`，agent-server pid `62836`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
- 实机回归 session：`~/.spotAgent/sessions/session-1779325061390-dcp2gi.json`，prompt 为 `[mock:clipboard-read] QA stale permission bubble timeout 20260521`；超时后 UI 只显示 `clipboard.read: 用户拒绝执行该 tool` 与 `Mock clipboard.read completed.`，不再显示 `授权调用 clipboard.read` 气泡。

**发现日期**：2026-05-21

**修复日期**：2026-05-21

---

### 11. OpenAI-compatible completion provider 404 后会话静默完成为空 assistant

**严重级别**：P1

**现象**：`openai-compatible + completion` 请求走 `/v1/completions` 后，provider 返回 404，但 session 被保存为成功完成的空 assistant，且没有 `error` event。

**期望结果**：provider 返回 HTTP 404、401、429、5xx 等失败响应时，agent-server 应把失败作为错误传播到 session：写入 `error` event，SessionWindow 显示明确错误，不能把失败请求保存为成功完成的空 assistant。

**状态**：已修复。

**根因边界**：

- `SettingsBackedLLMClient` 正确读取临时 settings 并构造 `openai-compatible + completion` client。
- `CapabilityAwareLLMClient` 正确把工具降级为 `[]`；网络日志证明请求体没有 `tools`、`tool_choice` 或点号风格 tool name。
- 失败点在 provider HTTP 错误传播：`VercelClient.stream()` 消费 AI SDK `response.fullStream` 时没有处理 `error` part；当 stream 没有 assistant 内容和 tool call 时仍 yield `message_end`，导致 `SessionRuntimeOrchestrator` 按正常完成持久化空 assistant。

**修复方式**：

- `packages/core/src/llm/VercelClient.ts` 遇到 AI SDK `fullStream` 的 `error` part 时立即抛出错误。
- 同一 stream 结束后如果既没有 assistant content，也没有 tool call，则抛出 `AI SDK stream finished without assistant content or tool calls.`，避免空 assistant 被当作成功结果。

**验证**：

- 修复前证据：session `~/.spotAgent/sessions/session-1779353692180-irv7zb.json` 只记录 user message 与空 assistant message，`events: []`；网络日志 `~/.spotAgent/log/2026-05-21/network-005.jsonl` 中 `2026-05-21T08:54:52.214Z` 请求 `https://lpgpt.us/v1/completions`，`2026-05-21T08:54:54.535Z` 响应为 provider 404。
- RED 测试覆盖：新增 `VercelClient` 测试先证明 AI SDK `error` part 和空 stream 都会被旧实现吞掉。
- 修复后定向测试通过：`pnpm exec vitest run packages/core/tests/llm/vercel-client.test.ts`，14 个测试通过。
- 修复后相关 LLM / runtime 测试通过：`pnpm exec vitest run packages/core/tests/llm/llm-client-factory.test.ts apps/agent-server/tests/settings/SettingsBackedLLMClient.test.ts apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts`，20 个测试通过。
- 直接 WebSocket 回归：`~/.spotAgent/sessions/session-1779354423036-68vu3t.json` 只保留 user message，events 记录 `error`，message 为 `openai_error`，不再持久化空 assistant。
- UI 回归：使用原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，提交 `QA completion tool downgrade fixed UI 20260521...` 后 SessionWindow 标题进入 `失败`，界面显示 `openai_error`；session `~/.spotAgent/sessions/session-1779354494947-a0uwtr.json` 只保留 user message，events 记录 `error: openai_error`。
- 清理状态：`~/.spotAgent/settings.json` 已恢复为 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.3-codex"`、`baseUrl: "https://lpgpt.us/v1"`。

**发现日期**：2026-05-21

**修复日期**：2026-05-21

---

## 当前 bug

### 1. 重新打包后的 HandAgent 会被 macOS 视为不同 App，既有隐私权限不通用

**严重级别**：P1

**发现日期**：2026-05-21

**复现步骤**：

1. 打包并启动 `dist/HandAgentDesktop.app`，在「系统设置 → 隐私与安全性」里授予屏幕录制 / 辅助功能等权限。
2. 修改代码后重新执行 `bash ./scripts/package-app.sh` 或 `bash ./scripts/package-app.sh --mock-llm`，生成新的 `dist/HandAgentDesktop.app`。
3. 启动重新打包后的 App，继续执行 `screen.capture`、`accessibility.snapshot` 或用户主动 `captureRegion` 圈选。

**实际结果**：

- 重新打包后的 App 在运行时可能不再复用旧 TCC 授权；`screen.capture` 在 packaged app 进程内 `CGPreflightScreenCaptureAccess()` 返回 false，提示需要重新授予「屏幕录制」权限。
- `accessibility.snapshot` / `accessibility.action` 经过真实 PlatformBridge 到达桌面 provider 后返回 `HandAgent 没有辅助功能权限。请打开「系统设置 → 隐私与安全性 → 辅助功能」，允许 HandAgent 后重试。`
- 用户主动 `captureRegion` 路径在重新授予当前打包 App 的权限后可正常工作；未重新授权时，自动化圈选容易得到错误的屏幕内容或权限相关行为，不能作为产品链路失败证据。

**期望结果**：

开发 / QA 打包产物应尽量保持稳定的 macOS TCC 身份，或者文档和打包流程必须明确提示：每次签名身份变化后，需要对当前 `dist/HandAgentDesktop.app` 重新授予屏幕录制、辅助功能等隐私权限，再继续实机 QA。

**证据**：

- ScreenCaptureKit clean bridge 回归中，当前 packaged app 进程内预检返回 false，session `~/.spotAgent/sessions/session-1779319444567-r98dh6.json` 记录 `permission_request(action: allow)` 后仍得到中文屏幕录制权限指引。
- 同轮取证显示当前 app 的 designated requirement 为 `designated => identifier "com.yourname.HandAgentDesktop"`；TCC 中旧 `kTCCServiceScreenCapture` 记录的 `csreq` 为旧 hash-style requirement：`FADE0C0000000028000000010000000800000014398791BDD8B31D8F6048BE46BB3973B34FEE5611`。
- Accessibility 回归 session `~/.spotAgent/sessions/session-1779352892449-iyjcj0.json` 与 `~/.spotAgent/sessions/session-1779352937653-pt4c60.json` 均经过真实 PlatformBridge，但返回辅助功能权限缺失。
- 2026-05-21 用户手动确认：重新授予当前打包 App 权限后，用户主动区域圈选路径可正常工作。

**初步调用链 / 根因边界**：

- `MockLLMClient` / real LLM -> tool call -> `SessionRuntimeOrchestrator` -> `WebSocketPlatformBridge` -> `PlatformBridgeService` 的请求链路已被多项 QA 证明可达。
- 失败点不在 tool schema、session 绑定或 PlatformBridge 连通性，而在 macOS TCC 对 bundle id、签名 requirement、应用路径 / 代码签名状态的身份判定。
- 当前仓库打包流程若产生新的签名 requirement，系统会把重新打包后的 `HandAgentDesktop.app` 当成新的受控主体；旧授权不能稳定迁移。

**状态**：未修复。后续需要在打包 / 签名策略或 QA 文档中固定开发构建的 TCC 身份；在修复前，每次重新打包后都要对当前 App 重新授权再做屏幕录制和辅助功能实机 QA。

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
