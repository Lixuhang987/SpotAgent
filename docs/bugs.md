# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-21。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复前先写出预期调用链，并把每一跳标成 checkpoint：说明该跳应发生什么、如何观察、什么证据能证明。
- 按顺序复现并验证每个 checkpoint，停在第一个未被证实的跳点；不要提前假设后续链路成功或失败。
- 只有在明确证明某一跳失败后，才实施最小修复；修复完成后需要补回能防止回归的测试或手工验收记录，并重新验证完整链路。

##  测试备注

### mock-llm 不能证明真实 vision 与真实 provider token streaming

- 2026-05-19 本轮实机 QA 使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。
- 图片附件链路可验证到 Quick Look、SessionWindow 摘要、blob stub 持久化；但 `[mock:image-summary]` 只返回固定文本，不能证明真实 LLM 基于图片内容描述。
- 2026-05-20 已补充 `MockLLMClient.stream()`；`[mock:assistant-ok]` 可验证 mock 模式下 agent-server 到 desktop 的多段 `assistant_message_delta` 渲染链路。
- 但 mock delta 是本地确定性分片，仍不能证明真实 provider 的网络 streaming、token 到达节奏或 vision 理解能力。
- 结论：真实 vision 与真实 provider token streaming 仍需要 real LLM 环境单独验证。

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

**发现日期**：2026-05-21

**复现步骤**：

1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。
2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
3. 通过 PromptPanel 连续提交两个 `[mock:assistant-ok]` prompt，确认同一个 SessionWindow 内已有两个完成态 tab。
4. 再通过 PromptPanel 提交 `[mock:slow-focus] QA multi tab running delete 20260521`，创建一个长时间 running 的第三个 tab。
5. 切回已完成 tab，确认侧栏中的 slow-focus 会话仍显示 `已打开, 1 条消息, 运行中`。
6. 在左侧历史列表对该 running session 右键删除，并在 `删除会话？ 删除后无法恢复本地历史文件。` 二次确认弹窗中点击「删除」。
7. 检查 session 文件、历史列表和已打开 tab 状态。

**实际结果**：

- server 侧会先 interrupt 再删除文件：`~/.spotAgent/sessions/session-1779302931963-dwt1qv.json` 删除成功，按 prompt 搜索 `~/.spotAgent/sessions/` 已无残留文件。
- 左侧历史列表刷新，running session 不再出现在历史列表中。
- 但顶部 tab bar 仍保留该 slow-focus tab；点击后该 tab 仍可激活，窗口标题仍显示 `运行中`，右上角仍显示 Stop 控件，内容区仍显示原 user message。

**期望结果**：

删除 running session 后，server 删除文件并返回 `delete_session_response` 时，桌面端应同步关闭对应已打开 tab，或至少将其标记为已删除 / interrupted，不应继续显示可交互的 `运行中` tab。

**证据**：

- 删除前 session 文件：`~/.spotAgent/sessions/session-1779302931963-dwt1qv.json`，`messageCount: 1`，只包含 `[mock:slow-focus] QA multi tab running delete 20260521`。
- 删除后文件检查：`test ! -f /Users/mu9/.spotAgent/sessions/session-1779302931963-dwt1qv.json` 成功；按 prompt 搜索 sessions 目录返回 `[]`。
- 删除后 UI：Computer Use 仍可见顶部 tab `切换到 [mock:slow-focus] QA multi tab running de...`；激活该 tab 后标题区显示 `运行中 3 个已打开标签页`，右上角显示 `停止`。
- agent-server 仍正常：`node ... /Users/mu9/proj/handAgent/apps/agent-server/src/server.ts` 监听 `*:4317`。

**原始待验证假设**：

- `SessionRouter.handleDeleteSession()`：如果目标 session running，会调用 `interruptAndWait(targetSessionId, push)`，随后 `persistence.deleteSession(targetSessionId)`，最后发送 `delete_session_response`。本轮文件删除成功，说明 server 侧 interrupt/delete 已执行。
- `SessionWindowViewModel.handleWindowEvent(.deleteSessionResponse)`：当前只调用 `refreshHistory()`，没有关闭 `tabs` 中 `sessionID == targetSessionId` 的已打开 tab，也没有把对应 tab 状态改为 interrupted/deleted。
- `SessionTabViewModel`：被删除的 tab 仍保留本地状态与 socket，因此 UI 继续展示旧的 running 状态。

**状态**：已修复；实机回归已复现到删除二次确认前，最终 GUI 删除确认等待人工授权。

**根因边界**：server 侧 `SessionRouter.handleDeleteSession()` 已按协议对 running session 执行 interrupt、删除持久化文件，并返回 `delete_session_response`，成功状态为 `deleted`。失败点在桌面端 `SessionWindowViewModel.handleWindowEvent(.deleteSessionResponse)`：旧实现只刷新历史列表，没有关闭 `tabs` 中同 `sessionID` 的已打开 tab，导致 `SessionTabViewModel` 继续保留本地 running 状态、socket 和 Stop 控件。

**checkpoint 与结论**：

- `delete_session_request` -> `SessionRouter.handleDeleteSession()`：源码确认目标 session 存在时会先 `interruptAndWait(targetSessionId, push)`，再 `persistence.deleteSession(targetSessionId)`，最后返回 `payload.status: "deleted"`；既有现场证据显示文件删除成功，server 链路不是本次失败点。
- `delete_session_response` -> `SessionSocketClient`：桌面端解析 `delete_session_response` 为 `.deleteSessionResponse(targetSessionID:status:)`，能把 `targetSessionId` 和 `status` 传到窗口级 ViewModel。
- `SessionWindowViewModel.handleWindowEvent(.deleteSessionResponse)` -> tab 状态：修复前 RED 测试证明收到 `.deleteSessionResponse(targetSessionID: "running-session", status: "deleted")` 后，`tabs` 仍为 `["finished-session", "running-session"]`，`activeTab` 仍是 `running-session`，`onTabClosed` 未触发，tab socket 未断开。
- tab close -> UI 状态：修复后成功删除响应复用既有 `closeTab(tabID)`，同步断开对应 tab socket、触发 `onTabClosed`、从 `tabs` 移除，并在 active tab 被删除时切到剩余最后一个 tab；历史列表仍照常刷新。

**验证**：

- 修复前 RED 证据：`bash ./scripts/swiftw test --filter SessionWindowViewModelTests/testSuccessfulDeleteSessionResponseClosesOpenRunningTabAndRefreshesHistoryList` 失败，断言显示 `tabs` 实际为 `["finished-session", "running-session"]`，`activeTab` 实际为 `running-session`，`closedSessionIDs` 为空，socket `cancelCount` 为 `0`。
- 修复后定向测试：`bash ./scripts/swiftw test --filter SessionWindowViewModelTests/testSuccessfulDeleteSessionResponseClosesOpenRunningTabAndRefreshesHistoryList` 通过。
- 修复后边界测试：`SessionWindowViewModelTests/testNonDeletedDeleteSessionResponseKeepsOpenTabAndRefreshesHistoryList` 覆盖 `status != "deleted"` 时只刷新历史、不误关已打开 tab；`bash ./scripts/swiftw test --filter SessionWindowViewModelTests` 通过。
- 修复后完整 Swift 测试：`bash ./scripts/swiftw test` 通过。
- 修复后 Swift build：`bash ./scripts/swiftw build` 通过。
- 修复后完整 TypeScript 测试：`bash ./scripts/test.sh` 通过，210 个测试通过，1 个 integration 跳过。
- 实机回归进展：`bash ./scripts/package-app.sh --mock-llm` 打包成功，启动的 `HandAgentDesktop` 与 agent-server 均来自 `/Users/mu9/proj/handAgent/.worktrees/delete-running-session-tab`；Computer Use 已确认两个完成态 tab 后创建第三个 `[mock:slow-focus] QA delete running regression target 20260521`，窗口显示 `运行中 3 个已打开标签页`，左侧历史项显示 `当前, 1 条消息, 运行中`。该 session 文件为 `~/.spotAgent/sessions/session-1779305136757-9dtg95.json`，当前 `messageCount: 1`；最终二次确认删除会通过 GUI 删除本地 session 文件，等待人工授权后继续完成回归。

**修复日期**：2026-05-21

---

### 9. 真实 provider streaming 被网络日志包装器缓冲，UI 只在完成后一次性显示

**严重级别**：P1

**发现日期**：2026-05-21

**复现步骤**：

1. 使用 real provider 配置启动 packaged App；本次配置为 `provider: openai-compatible`、`api: chat`、`model: gpt-5.3-codex`，`HandAgentRuntimeMode.json` 不存在。
2. 通过 PromptPanel 提交长回复 prompt：`QA real streaming visible 20260521: Write 800 numbered checklist items about visible streaming in a desktop agent UI...`。
3. 在 SessionWindow 保持可见时用 Computer Use 连续观察运行态。
4. 检查 `~/.spotAgent/log/2026-05-21/network-*.jsonl` 与 `~/.spotAgent/sessions/session-1779310927238-nvw6y2.json`。

**实际结果**：

- UI 在请求期间显示 `运行中`、Stop 按钮和空 assistant 气泡占位；多次 Computer Use 采样均未看到 assistant 文本逐段增长。
- 请求结束后，SessionWindow 一次性显示完整 800 条 assistant 回复。
- `network-004.jsonl` 记录同一请求的 response 为 `status: 200`，包含 `6544` 个 `chat.completion.chunk`、`6542` 个 `delta.content` 与 `[DONE]`。
- session 文件在完成后才出现 assistant message，长度约 `11836` 字符。

**期望结果**：

真实 provider 的 SSE content delta 到达后应逐段转成 `assistant_message_delta`，SessionWindow 中 assistant 气泡应在 `运行中` 状态下可见增长，而不是等整个 HTTP 响应结束后一次性渲染。

**证据**：

- UI 运行态证据：Computer Use 采样显示标题区 `运行中 3 个已打开标签页`、Stop 按钮可见、内容区只有 user message 与空 assistant 占位。
- 后端 SSE 证据：`~/.spotAgent/log/2026-05-21/network-004.jsonl` 第 1 行 response，`chunks: 6544`、`content deltas: 6542`、包含 `[DONE]`。
- 持久化证据：`~/.spotAgent/sessions/session-1779310927238-nvw6y2.json` 完成后为 2 条 message，assistant 内容完整写入。

**初步调用链 / 根因边界**：

- provider -> HTTP SSE：已验证，网络日志中存在大量 `chat.completion.chunk` 与 `delta.content`。
- `createLoggingFetch()` -> AI SDK `streamText()`：失败点在 `packages/core/src/logging/createLoggingFetch.ts`。当前实现 `await response.clone().text()` 后才 `return response`，因此 streamed response 会先被日志 clone 完整读完，调用方拿到 response 时 SSE 已结束。
- AI SDK -> `AgentRuntime` -> WebSocket -> SwiftUI：mock streaming 与自动化测试已覆盖多段 delta 渲染；本次现场表现与 fetch 包装器缓冲一致，仍需修复后做 real provider 实机回归。

**状态**：已修复。

**根因边界**：`packages/core/src/logging/createLoggingFetch.ts` 在收到 response 后固定执行 `await response.clone().text()`，再把原 response 返回给调用方。对 `text/event-stream` 来说，这会让日志 clone 先读完整个 SSE body，AI SDK 随后才开始消费原 response，因此 `AgentRuntime`、WebSocket 和 SwiftUI 都只能在响应完成后收到文本增量。

**checkpoint 与结论**：

- provider -> HTTP SSE：修复前 `network-004.jsonl` 记录同一请求有 `6544` 个 `chat.completion.chunk`、`6542` 个 `delta.content` 与 `[DONE]`，证明 provider 实际返回了流式分片。
- logging fetch -> AI SDK：修复前新增 RED 测试证明 `createLoggingFetch()` 包装 `text/event-stream` response 时，wrapped fetch promise 直到 stream close 后才 resolve；失败点锁定在日志包装器。
- logging fetch 修复：对 `Content-Type: text/event-stream` 的 response 不再 clone/read body，而是立即记录 `body: "[streaming response: text/event-stream]"` 并返回原 response。
- AI SDK -> SessionWindow：修复后 real provider 实机回归显示窗口仍为 `运行中` 时，assistant 气泡已从 `STREAM_START\n1.` 增长到至少第 86 条。

**验证**：

- 修复前 RED 证据：`pnpm vitest run packages/core/tests/logging/logging-fetch.test.ts` 中新增测试失败，断言 `resolved` 期望 `true`、实际为 `false`。
- 修复后定向测试：`pnpm vitest run packages/core/tests/logging/logging-fetch.test.ts` 通过，5 个测试通过。
- 修复后完整 TypeScript 测试：`bash ./scripts/test.sh` 通过，212 个测试通过，1 个 integration 跳过。
- 修复后 Swift 测试：`bash ./scripts/swiftw test` 通过。
- 修复后 Swift build：`bash ./scripts/swiftw build` 通过。
- 修复后实机回归：非 mock packaged App 提交 `QA real streaming fixed 20260521...`；Computer Use 在 `运行中` 状态采样到 `STREAM_START`、`1.`，随后同一 run 增长到至少第 86 条；`~/.spotAgent/sessions/session-1779311685828-kaqr5f.json` 完成后包含 2 条消息；`~/.spotAgent/log/2026-05-21/network-005.jsonl` response 记录为 `[streaming response: text/event-stream]`。
- 最终代码 smoke：处理 code review 后重新打包非 mock App，提交 `QA real streaming exact-code smoke 20260521...`；Computer Use 在 `运行中` 状态采样到 `EXACT_STREAM_START` 与条目 1 到 250；`~/.spotAgent/sessions/session-1779312326930-rilxsi.json` 完成后包含 2 条消息；`network-005.jsonl` 第 4 行 response 仍为 `[streaming response: text/event-stream]`。

**修复日期**：2026-05-21

---

## 当前 bug

暂无未修复 bug。`删除 running session 后已打开 tab 仍显示运行中` 已完成代码修复和自动化验证，仍需完成最终 GUI 删除确认后的实机回归闭环。
